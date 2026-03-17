import assert from 'node:assert/strict';
import test from 'node:test';
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
const defaultDebuggerConfig = {
  url: '',
  remoteUploadAllowed: false,
  isInternalExecutor: false,
};
const defaultConnectionState = {
  started: false,
  reconnecting: false,
};

let debuggerConfig = { ...defaultDebuggerConfig };
let connectionState = { ...defaultConnectionState };
let runtime: ExecutorSessionRuntime;

test.beforeEach(() => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  debuggerConfig = { ...defaultDebuggerConfig };
  connectionState = { ...defaultConnectionState };
  runtime = createExecutorSessionRuntime({
    datasetProvider: {} as never,
    setDebuggerConfig: (updater) => {
      debuggerConfig = typeof updater === 'function' ? updater(debuggerConfig) : updater;
    },
    setConnectionState: (updater) => {
      connectionState = typeof updater === 'function' ? updater(connectionState) : updater;
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

  const unsubscribe = runtime.subscribeLifecycle('disconnect', () => {
    disconnectCount += 1;
  });

  await runtime.connect('ws://localhost:9999');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  runtime.disconnect();
  socket.emitClose();

  unsubscribe();

  assert.equal(disconnectCount, 1);
  assert.equal(runtime.getRuntimeState().status, 'idle');
  assert.equal(runtime.getRuntimeState().socket, null);
});

test('unexpected disconnect notifies listeners and transitions to reconnecting', async () => {
  let disconnectCount = 0;

  const unsubscribe = runtime.subscribeLifecycle('disconnect', () => {
    disconnectCount += 1;
  });

  await runtime.connect('ws://localhost:7777');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitClose();

  unsubscribe();

  assert.equal(disconnectCount, 1);
  assert.equal(runtime.getRuntimeState().status, 'reconnecting');
  assert.equal(runtime.getRuntimeState().socket, null);
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

test('clears remote upload capability when replacing the active session', async () => {
  await runtime.connect('ws://localhost:1111');
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.open();
  firstSocket.emitMessage({
    message: 'graph-upload-allowed',
    data: undefined,
  });

  assert.equal(debuggerConfig.remoteUploadAllowed, true);

  await runtime.connect('ws://localhost:2222');

  assert.equal(debuggerConfig.url, 'ws://localhost:2222');
  assert.equal(debuggerConfig.remoteUploadAllowed, false);
});

test('buildExecutorSessionState derives legacy connection flags from runtime status', async () => {
  await runtime.connect('ws://localhost:3333');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  const sessionState = runtime.buildSessionState(defaultDebuggerConfig, defaultConnectionState);

  assert.equal(sessionState.status, 'ready');
  assert.equal(sessionState.started, true);
  assert.equal(sessionState.reconnecting, false);
});

test('tracks overlapping pending graph executions by request id', async () => {
  const first = runtime.createPendingGraphExecution('request-1');
  const second = runtime.createPendingGraphExecution('request-2');

  runtime.resolvePendingGraphExecution('request-2', { second: 'done' });
  runtime.resolvePendingGraphExecution('request-1', { first: 'done' });

  assert.deepEqual(await first.promise, { first: 'done' });
  assert.deepEqual(await second.promise, { second: 'done' });
});

test('rejects only the targeted pending execution when multiple requests are active', async () => {
  const first = runtime.createPendingGraphExecution('request-1');
  const second = runtime.createPendingGraphExecution('request-2');

  runtime.rejectPendingGraphExecution('request-1', new Error('request-1 failed'));
  runtime.resolvePendingGraphExecution('request-2', { second: 'done' });

  await assert.rejects(first.promise, /request-1 failed/);
  assert.deepEqual(await second.promise, { second: 'done' });
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

test('logs websocket transport errors without breaking the session', async () => {
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  await runtime.connect('ws://localhost:5555');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  socket.emitError();

  assert.equal(runtime.getRuntimeState().status, 'ready');
  assert.equal(logged.length, 1);
  assert.equal((logged[0] as unknown[])[0], '[Executor websocket transport error]');
});
