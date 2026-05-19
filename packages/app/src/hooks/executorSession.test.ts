import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphOutputs } from '@valerypopoff/rivet2-core';
import { createExecutorSessionRuntime, type ExecutorSessionRuntime } from './executorSession';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  send(data: string) {
    this.sent.push(data);
  }

  emitClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  emitRawMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }

  emitError() {
    this.onerror?.({ type: 'error' } as Event);
  }
}

const originalWebSocket = globalThis.WebSocket;
const originalConsoleError = console.error;
let sessionRevision = 0;
let runtime: ExecutorSessionRuntime;

const buildOutputs = (key: string, value: string): GraphOutputs => ({
  [key]: { type: 'string', value },
});

function captureConsoleErrors() {
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  return logged;
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test.beforeEach(() => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  sessionRevision = 0;
  runtime = createExecutorSessionRuntime({
    datasetProvider: {} as never,
    onStateChange: () => {
      sessionRevision += 1;
    },
  });
});

test.afterEach(() => {
  const socket = runtime.getRuntimeState().socket as unknown as FakeWebSocket | null;
  runtime.disconnect();
  socket?.emitClose();
  globalThis.WebSocket = originalWebSocket;
  console.error = originalConsoleError;
});

test('ignores stale socket close events after reconnecting to a new session', async () => {
  await runtime.connect('ws://localhost:1234');
  const firstSocket = FakeWebSocket.instances[0]!;

  await runtime.connect('ws://localhost:5678');
  const secondSocket = FakeWebSocket.instances[1]!;

  secondSocket.open();
  firstSocket.emitClose();

  assert.equal(runtime.getRuntimeState().status, 'ready');
  assert.equal(runtime.getRuntimeState().socket, secondSocket);
});

test('manual disconnect only notifies listeners once', async () => {
  let disconnectCount = 0;
  let disconnectReason: string | undefined;
  let disconnectIsInternal: boolean | undefined;
  let statusAtDisconnect: string | undefined;

  const unsubscribe = runtime.subscribeLifecycle('disconnect', (event) => {
    disconnectCount += 1;
    disconnectReason = event.reason;
    disconnectIsInternal = event.isInternalExecutor;
    statusAtDisconnect = runtime.getRuntimeState().status;
  });

  await runtime.connect('ws://localhost:9999');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  runtime.disconnect();
  socket.emitClose();

  unsubscribe();

  assert.equal(disconnectCount, 1);
  assert.equal(disconnectReason, 'manual-disconnect');
  assert.equal(disconnectIsInternal, false);
  assert.equal(statusAtDisconnect, 'idle');
  assert.equal(runtime.getRuntimeState().status, 'idle');
  assert.equal(runtime.getRuntimeState().socket, null);
});

test('manual external debugger disconnect can immediately restore internal executor without losing cleanup event', async () => {
  let disconnectCount = 0;
  let disconnectReason: string | undefined;
  let disconnectIsInternal: boolean | undefined;

  const unsubscribe = runtime.subscribeLifecycle('disconnect', (event) => {
    disconnectCount += 1;
    disconnectReason = event.reason;
    disconnectIsInternal = event.isInternalExecutor;
  });

  await runtime.connect('ws://debugger.example/latest');
  const externalSocket = FakeWebSocket.instances[0]!;
  externalSocket.open();

  runtime.disconnect();
  await runtime.connectInternal('ws://executor.example/internal');
  const internalSocket = FakeWebSocket.instances[1]!;
  externalSocket.emitClose();
  internalSocket.open();

  unsubscribe();

  const sessionState = runtime.buildSessionState();

  assert.equal(disconnectCount, 1);
  assert.equal(disconnectReason, 'manual-disconnect');
  assert.equal(disconnectIsInternal, false);
  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(sessionState.status, 'ready');
  assert.equal(sessionState.isInternalExecutor, true);
  assert.equal(sessionState.socket, internalSocket);
});

test('unexpected internal executor disconnect notifies listeners and transitions to reconnecting', async () => {
  let disconnectCount = 0;
  let statusAtDisconnect: string | undefined;
  let disconnectReason: string | undefined;
  let disconnectIsInternal: boolean | undefined;

  const unsubscribe = runtime.subscribeLifecycle('disconnect', (event) => {
    disconnectCount += 1;
    disconnectReason = event.reason;
    disconnectIsInternal = event.isInternalExecutor;
    statusAtDisconnect = runtime.getRuntimeState().status;
  });

  await runtime.connectInternal('ws://localhost:7777/internal');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitClose();

  unsubscribe();

  assert.equal(disconnectCount, 1);
  assert.equal(disconnectReason, 'unexpected-disconnect');
  assert.equal(disconnectIsInternal, true);
  assert.equal(statusAtDisconnect, 'reconnecting');
  assert.equal(runtime.getRuntimeState().status, 'reconnecting');
  assert.equal(runtime.getRuntimeState().socket, null);
});

test('manual reconnect during an internal executor disconnect callback cancels the scheduled reconnect', async () => {
  const unsubscribe = runtime.subscribeLifecycle('disconnect', (event) => {
    if (event.reason === 'unexpected-disconnect' && event.isInternalExecutor) {
      void runtime.connectInternal('ws://executor.example/manual-internal');
    }
  });

  await runtime.connectInternal('ws://executor.example/internal');
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.open();
  firstSocket.emitClose();

  await new Promise((resolve) => setTimeout(resolve, 175));
  unsubscribe();

  const secondSocket = FakeWebSocket.instances[1]!;
  secondSocket.open();

  const sessionState = runtime.buildSessionState();

  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(secondSocket.url, 'ws://executor.example/manual-internal');
  assert.equal(sessionState.status, 'ready');
  assert.equal(sessionState.isInternalExecutor, true);
});

test('unexpected external debugger disconnect does not reconnect automatically', async () => {
  let disconnectCount = 0;
  let statusAtDisconnect: string | undefined;
  let disconnectReason: string | undefined;
  let disconnectIsInternal: boolean | undefined;

  const unsubscribe = runtime.subscribeLifecycle('disconnect', (event) => {
    disconnectCount += 1;
    disconnectReason = event.reason;
    disconnectIsInternal = event.isInternalExecutor;
    statusAtDisconnect = runtime.getRuntimeState().status;
  });

  await runtime.connect('ws://localhost:7778');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitClose();

  await new Promise((resolve) => setTimeout(resolve, 175));
  unsubscribe();

  assert.equal(disconnectCount, 1);
  assert.equal(disconnectReason, 'unexpected-disconnect');
  assert.equal(disconnectIsInternal, false);
  assert.equal(statusAtDisconnect, 'idle');
  assert.equal(runtime.getRuntimeState().status, 'idle');
  assert.equal(runtime.getRuntimeState().socket, null);
  assert.equal(FakeWebSocket.instances.length, 1);
});

test('external debugger drop can hand back to the internal executor without reconnecting externally', async () => {
  const unsubscribe = runtime.subscribeLifecycle('disconnect', (event) => {
    if (event.reason === 'unexpected-disconnect' && !event.isInternalExecutor) {
      void runtime.connectInternal('ws://executor.example/internal');
    }
  });

  await runtime.connect('ws://debugger.example/latest');
  const externalSocket = FakeWebSocket.instances[0]!;
  externalSocket.open();
  externalSocket.emitClose();

  await new Promise((resolve) => setTimeout(resolve, 175));
  unsubscribe();

  const internalSocket = FakeWebSocket.instances[1]!;
  internalSocket.open();

  const sessionState = runtime.buildSessionState();

  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(externalSocket.url, 'ws://debugger.example/latest');
  assert.equal(internalSocket.url, 'ws://executor.example/internal');
  assert.equal(sessionState.status, 'ready');
  assert.equal(sessionState.isInternalExecutor, true);
});

test('delivers process messages to all subscribed handlers', async () => {
  const receivedByFirst: string[] = [];
  const receivedBySecond: string[] = [];

  const unsubscribeFirst = runtime.subscribeMessages((message) => {
    receivedByFirst.push(String(message));
  });
  const unsubscribeSecond = runtime.subscribeMessages((message) => {
    receivedBySecond.push(String(message));
  });

  await runtime.connect('ws://localhost:8888');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitMessage({
    message: 'trace',
    data: 'hello',
  });

  unsubscribeFirst();
  unsubscribeSecond();

  assert.deepEqual(receivedByFirst, ['trace']);
  assert.deepEqual(receivedBySecond, ['trace']);
});

test('continues notifying lifecycle subscribers when one subscriber throws', async () => {
  const logged = captureConsoleErrors();
  let secondSubscriberCalled = false;

  const unsubscribeFirst = runtime.subscribeLifecycle('disconnect', () => {
    throw new Error('subscriber failed');
  });
  const unsubscribeSecond = runtime.subscribeLifecycle('disconnect', () => {
    secondSubscriberCalled = true;
  });

  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  runtime.disconnect();

  unsubscribeFirst();
  unsubscribeSecond();

  assert.equal(secondSubscriberCalled, true);
  assert.equal((logged[0] as unknown[])[0], '[Executor session lifecycle subscriber failed]');
});

test('continues notifying lifecycle subscribers when one async subscriber rejects', async () => {
  const logged = captureConsoleErrors();
  let secondSubscriberCalled = false;

  const unsubscribeFirst = runtime.subscribeLifecycle('disconnect', async () => {
    throw new Error('async subscriber failed');
  });
  const unsubscribeSecond = runtime.subscribeLifecycle('disconnect', () => {
    secondSubscriberCalled = true;
  });

  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  runtime.disconnect();
  await flushMicrotasks();

  unsubscribeFirst();
  unsubscribeSecond();

  assert.equal(secondSubscriberCalled, true);
  assert.equal((logged[0] as unknown[])[0], '[Executor session lifecycle subscriber failed]');
});

test('continues notifying process-message subscribers when one subscriber throws', async () => {
  const logged = captureConsoleErrors();
  const receivedBySecond: string[] = [];

  const unsubscribeFirst = runtime.subscribeMessages(() => {
    throw new Error('handler failed');
  });
  const unsubscribeSecond = runtime.subscribeMessages((message) => {
    receivedBySecond.push(String(message));
  });

  await runtime.connect('ws://localhost:8888');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitMessage({
    message: 'trace',
    data: 'hello',
  });

  unsubscribeFirst();
  unsubscribeSecond();

  assert.deepEqual(receivedBySecond, ['trace']);
  assert.equal((logged[0] as unknown[])[0], '[Executor process-message subscriber failed]');
});

test('continues notifying process-message subscribers when one async subscriber rejects', async () => {
  const logged = captureConsoleErrors();
  const receivedBySecond: string[] = [];

  const unsubscribeFirst = runtime.subscribeMessages(async () => {
    throw new Error('async handler failed');
  });
  const unsubscribeSecond = runtime.subscribeMessages((message) => {
    receivedBySecond.push(String(message));
  });

  await runtime.connect('ws://localhost:8888');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitMessage({
    message: 'trace',
    data: 'hello',
  });
  await flushMicrotasks();

  unsubscribeFirst();
  unsubscribeSecond();

  assert.deepEqual(receivedBySecond, ['trace']);
  assert.equal((logged[0] as unknown[])[0], '[Executor process-message subscriber failed]');
});

test('logs state-change callback failures without breaking websocket lifecycle', async () => {
  const logged = captureConsoleErrors();
  const throwingRuntime = createExecutorSessionRuntime({
    datasetProvider: {} as never,
    onStateChange: () => {
      throw new Error('state change failed');
    },
  });

  await throwingRuntime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  assert.equal(throwingRuntime.getRuntimeState().status, 'ready');
  assert.equal(
    logged.some((entry) => (entry as unknown[])[0] === '[Executor session state-change callback failed]'),
    true,
  );

  throwingRuntime.disconnect();
});

test('logs async state-change callback rejections without breaking websocket lifecycle', async () => {
  const logged = captureConsoleErrors();
  const throwingRuntime = createExecutorSessionRuntime({
    datasetProvider: {} as never,
    onStateChange: async () => {
      throw new Error('async state change failed');
    },
  });

  await throwingRuntime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  await flushMicrotasks();

  assert.equal(throwingRuntime.getRuntimeState().status, 'ready');
  assert.equal(
    logged.some((entry) => (entry as unknown[])[0] === '[Executor session state-change callback failed]'),
    true,
  );

  throwingRuntime.disconnect();
  await flushMicrotasks();
});

test('delivers Code console messages to subscribers', async () => {
  const received: unknown[] = [];
  const unsubscribe = runtime.subscribeMessages((message, data) => {
    received.push({ data, message });
  });

  await runtime.connect('ws://localhost:8889');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitMessage({
    message: 'codeConsole',
    data: {
      level: 'log',
      args: ['hello from code'],
    },
    requestId: 'request-1',
  });

  unsubscribe();

  assert.deepEqual(received, [
    {
      message: 'codeConsole',
      data: {
        level: 'log',
        args: ['hello from code'],
      },
    },
  ]);
});

test('clears remote upload capability when replacing the active session', async () => {
  await runtime.connect('ws://localhost:1111');
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.open();
  firstSocket.emitMessage({
    message: 'graph-upload-allowed',
    data: undefined,
  });

  assert.equal(runtime.getRuntimeState().remoteUploadAllowed, true);

  await runtime.connect('ws://localhost:2222');

  assert.equal(runtime.getRuntimeState().url, 'ws://localhost:2222');
  assert.equal(runtime.getRuntimeState().remoteUploadAllowed, false);
});

test('derives executor capabilities from socket readiness and upload permission', async () => {
  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;

  assert.equal(runtime.getRuntimeState().capabilities.canSendRun, false);

  socket.open();

  assert.equal(runtime.getRuntimeState().capabilities.canSendRun, true);
  assert.equal(runtime.getRuntimeState().capabilities.canUploadProject, false);

  socket.emitMessage({
    message: 'graph-upload-allowed',
    data: undefined,
  });

  assert.equal(runtime.getRuntimeState().capabilities.canUploadProject, true);
  assert.equal(runtime.buildSessionState().remoteUploadAllowed, true);
});

test('guards socket recording behind the record capability', async () => {
  let recordedSocket: FakeWebSocket | undefined;

  assert.equal(
    runtime.recordSocketEvents(async (socket) => {
      recordedSocket = socket as unknown as FakeWebSocket;
    }),
    undefined,
  );
  assert.equal(recordedSocket, undefined);

  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;

  assert.equal(
    runtime.recordSocketEvents(async (socket) => {
      recordedSocket = socket as unknown as FakeWebSocket;
    }),
    undefined,
  );
  assert.equal(recordedSocket, undefined);

  socket.open();

  await runtime.recordSocketEvents(async (socket) => {
    recordedSocket = socket as unknown as FakeWebSocket;
  });

  assert.equal(recordedSocket, socket);
});

test('reports whether executor protocol messages were sent', async () => {
  assert.equal(runtime.sendMessage('abort', undefined), false);

  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  assert.equal(runtime.sendMessage('abort', undefined), true);
  assert.deepEqual(socket.sent.map((message) => JSON.parse(message)), [{ type: 'abort' }]);
});

test('notifies consumers when runtime-owned session facts change', async () => {
  const initialRevision = sessionRevision;

  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;
  const connectingRevision = sessionRevision;
  socket.open();
  const readyRevision = sessionRevision;
  socket.emitMessage({
    message: 'graph-upload-allowed',
    data: undefined,
  });

  assert.ok(connectingRevision > initialRevision);
  assert.ok(readyRevision > connectingRevision);
  assert.ok(sessionRevision > readyRevision);
});

test('replacing an active session notifies subscribers and rejects pending graph executions', async () => {
  let disconnectReason: string | undefined;
  let disconnectStatus: string | undefined;
  let disconnectTarget: string | undefined;
  let runtimeStatusAtDisconnect: string | undefined;
  const unsubscribe = runtime.subscribeLifecycle('disconnect', (event) => {
    disconnectReason = event.reason;
    disconnectStatus = event.status;
    disconnectTarget = event.target?.type;
    runtimeStatusAtDisconnect = runtime.getRuntimeState().status;
  });

  await runtime.connectInternalHostedExecutor('ws://executor.example/internal');
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.open();

  const pending = runtime.createPendingGraphExecution('request-1');
  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const secondSocket = FakeWebSocket.instances[1]!;
  secondSocket.open();

  unsubscribe();

  await assert.rejects(pending.promise, /executor session replaced/);
  assert.equal(disconnectReason, 'replaced');
  assert.equal(disconnectStatus, 'idle');
  assert.equal(disconnectTarget, 'internal-hosted');
  assert.equal(runtimeStatusAtDisconnect, 'idle');
  assert.equal(runtime.getRuntimeState().socket, secondSocket);
  assert.equal(runtime.getRuntimeState().target?.type, 'external-debugger');
});

test('buildExecutorSessionState derives legacy connection flags from runtime status', async () => {
  await runtime.connect('ws://localhost:3333');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  const sessionState = runtime.buildSessionState();

  assert.equal(sessionState.status, 'ready');
  assert.equal(sessionState.started, true);
  assert.equal(sessionState.reconnecting, false);
});

test('buildExecutorSessionState is owned by runtime state while idle', () => {
  const sessionState = runtime.buildSessionState();

  assert.equal(sessionState.status, 'idle');
  assert.equal(sessionState.started, false);
  assert.equal(sessionState.reconnecting, false);
  assert.equal(sessionState.url, '');
  assert.equal(sessionState.remoteUploadAllowed, false);
  assert.equal(sessionState.isInternalExecutor, false);
  assert.equal(sessionState.target, null);
});

test('dataset provider changes update bridge capability without changing target state', async () => {
  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  assert.equal(runtime.getRuntimeState().capabilities.canBridgeDatasets, true);

  runtime.setDatasetProvider(null);

  const sessionState = runtime.buildSessionState();

  assert.equal(sessionState.capabilities.canBridgeDatasets, false);
  assert.deepEqual(sessionState.target, { type: 'external-debugger', url: 'ws://debugger.example/latest' });
});

test('connectInternal marks custom hosted executor URLs as internal sessions', async () => {
  await runtime.connectInternal('ws://executor.example/internal');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  const sessionState = runtime.buildSessionState();

  assert.equal(sessionState.status, 'ready');
  assert.equal(sessionState.url, 'ws://executor.example/internal');
  assert.equal(sessionState.isInternalExecutor, true);
  assert.deepEqual(sessionState.target, { type: 'internal-hosted', url: 'ws://executor.example/internal' });
});

test('connectInternalDesktopExecutor marks the default sidecar URL as desktop internal', async () => {
  await runtime.connectInternalDesktopExecutor();
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  const sessionState = runtime.buildSessionState();

  assert.deepEqual(sessionState.target, { type: 'internal-desktop', url: 'ws://127.0.0.1:21889/internal' });
  assert.equal(sessionState.isInternalExecutor, true);
});

test('connectExternalDebugger marks sessions as external debugger targets', async () => {
  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  const sessionState = runtime.buildSessionState();

  assert.deepEqual(sessionState.target, { type: 'external-debugger', url: 'ws://debugger.example/latest' });
  assert.equal(sessionState.isInternalExecutor, false);
});

test('clears target state when websocket construction fails', async () => {
  globalThis.WebSocket = class {
    constructor() {
      throw new Error('websocket constructor failed');
    }
  } as unknown as typeof WebSocket;

  await assert.rejects(runtime.connectExternalDebugger('not-a-websocket-url'), /websocket constructor failed/);

  const sessionState = runtime.buildSessionState();

  assert.equal(sessionState.status, 'idle');
  assert.equal(sessionState.target, null);
  assert.equal(sessionState.url, '');
});

test('reuses the existing websocket when reconnecting to the same target', async () => {
  let disconnectCount = 0;
  const unsubscribe = runtime.subscribeLifecycle('disconnect', () => {
    disconnectCount += 1;
  });

  await runtime.connectExternalDebugger('ws://executor.example/shared');
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.open();

  await runtime.connectExternalDebugger('ws://executor.example/shared');
  unsubscribe();

  const sessionState = runtime.buildSessionState();

  assert.equal(disconnectCount, 0);
  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(sessionState.socket, firstSocket);
  assert.deepEqual(sessionState.target, { type: 'external-debugger', url: 'ws://executor.example/shared' });
});

test('reconnect preserves internal classification for custom hosted executor URLs', async () => {
  await runtime.connectInternal('ws://executor.example/internal');
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.open();
  firstSocket.emitClose();

  await new Promise((resolve) => setTimeout(resolve, 175));
  const secondSocket = FakeWebSocket.instances[1]!;
  secondSocket.open();

  const sessionState = runtime.buildSessionState();

  assert.equal(secondSocket.url, 'ws://executor.example/internal');
  assert.equal(sessionState.status, 'ready');
  assert.equal(sessionState.url, 'ws://executor.example/internal');
  assert.equal(sessionState.isInternalExecutor, true);
  assert.deepEqual(sessionState.target, { type: 'internal-hosted', url: 'ws://executor.example/internal' });
});

test('connectInternal replaces an external session even when the URL matches', async () => {
  let disconnectReason: string | undefined;
  let disconnectTarget: string | undefined;
  const unsubscribe = runtime.subscribeLifecycle('disconnect', (event) => {
    disconnectReason = event.reason;
    disconnectTarget = event.target?.type;
  });

  await runtime.connect('ws://executor.example/internal');
  const externalSocket = FakeWebSocket.instances[0]!;
  externalSocket.open();

  await runtime.connectInternal('ws://executor.example/internal');
  const internalSocket = FakeWebSocket.instances[1]!;
  internalSocket.open();
  unsubscribe();

  const sessionState = runtime.buildSessionState();

  assert.equal(disconnectReason, 'replaced');
  assert.equal(disconnectTarget, 'external-debugger');
  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(sessionState.socket, internalSocket);
  assert.equal(sessionState.isInternalExecutor, true);
  assert.deepEqual(sessionState.target, { type: 'internal-hosted', url: 'ws://executor.example/internal' });
});

test('replacing a closing same-target socket notifies subscribers and rejects pending graph executions', async () => {
  let disconnectReason: string | undefined;
  let disconnectStatus: string | undefined;
  let runtimeStatusAtDisconnect: string | undefined;
  const unsubscribe = runtime.subscribeLifecycle('disconnect', (event) => {
    disconnectReason = event.reason;
    disconnectStatus = event.status;
    runtimeStatusAtDisconnect = runtime.getRuntimeState().status;
  });

  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.open();
  firstSocket.readyState = FakeWebSocket.CLOSING;

  const pending = runtime.createPendingGraphExecution('request-1');
  await runtime.connectExternalDebugger('ws://debugger.example/latest');
  const secondSocket = FakeWebSocket.instances[1]!;
  secondSocket.open();
  unsubscribe();

  await assert.rejects(pending.promise, /executor session replaced/);
  assert.equal(disconnectReason, 'replaced');
  assert.equal(disconnectStatus, 'idle');
  assert.equal(runtimeStatusAtDisconnect, 'idle');
  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(runtime.getRuntimeState().socket, secondSocket);
  assert.deepEqual(runtime.getRuntimeState().target, { type: 'external-debugger', url: 'ws://debugger.example/latest' });
});

test('tracks overlapping pending graph executions by request id', async () => {
  const first = runtime.createPendingGraphExecution('request-1');
  const second = runtime.createPendingGraphExecution('request-2');

  runtime.resolvePendingGraphExecution('request-2', buildOutputs('second', 'done'));
  runtime.resolvePendingGraphExecution('request-1', buildOutputs('first', 'done'));

  assert.deepEqual(await first.promise, buildOutputs('first', 'done'));
  assert.deepEqual(await second.promise, buildOutputs('second', 'done'));
});

test('rejects only the targeted pending execution when multiple requests are active', async () => {
  const first = runtime.createPendingGraphExecution('request-1');
  const second = runtime.createPendingGraphExecution('request-2');

  runtime.rejectPendingGraphExecution('request-1', new Error('request-1 failed'));
  runtime.resolvePendingGraphExecution('request-2', buildOutputs('second', 'done'));

  await assert.rejects(first.promise, /request-1 failed/);
  assert.deepEqual(await second.promise, buildOutputs('second', 'done'));
});

test('logs malformed executor messages without breaking the session', async () => {
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  await runtime.connect('ws://localhost:4444');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  socket.emitRawMessage('{not-json');

  assert.equal(runtime.getRuntimeState().status, 'ready');
  assert.equal(logged.length, 1);
  assert.equal((logged[0] as unknown[])[0], '[Failed to parse executor message]');
});

test('logs malformed executor message envelopes without breaking the session', async () => {
  const logged = captureConsoleErrors();

  await runtime.connect('ws://localhost:4445');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  socket.emitRawMessage(JSON.stringify({ data: 'missing message field' }));

  assert.equal(runtime.getRuntimeState().status, 'ready');
  assert.equal(logged.length, 1);
  assert.equal((logged[0] as unknown[])[0], '[Failed to parse executor message]');
});

test('logs websocket transport errors without breaking the session', async () => {
  const logged = captureConsoleErrors();

  await runtime.connect('ws://localhost:5555');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  socket.emitError();

  assert.equal(runtime.getRuntimeState().status, 'ready');
  assert.equal(logged.length, 1);
  assert.equal((logged[0] as unknown[])[0], '[Executor websocket transport error]');
});

test('logs dataset provider failures without breaking the session', async () => {
  const logged = captureConsoleErrors();
  runtime.setDatasetProvider({
    getDatasetMetadata: async () => {
      throw new Error('dataset provider failed');
    },
  } as never);

  await runtime.connect('ws://localhost:6666');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitMessage({
    message: 'datasets:get-metadata',
    data: {
      payload: { id: 'dataset-1' },
      requestId: 'dataset-request-1',
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(runtime.getRuntimeState().status, 'ready');
  assert.equal((logged[0] as unknown[])[0], '[Failed to handle executor dataset request]');
});

test('drops late dataset responses for closed sockets without logging an error', async () => {
  const logged = captureConsoleErrors();
  let resolveMetadata!: (value: unknown) => void;
  runtime.setDatasetProvider({
    getDatasetMetadata: async () =>
      new Promise((resolve) => {
        resolveMetadata = resolve;
      }),
  } as never);

  await runtime.connect('ws://localhost:7777');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitMessage({
    message: 'datasets:get-metadata',
    data: {
      payload: { id: 'dataset-1' },
      requestId: 'dataset-request-1',
    },
  });

  socket.close();
  resolveMetadata({ id: 'dataset-1' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(logged.length, 0);
});
