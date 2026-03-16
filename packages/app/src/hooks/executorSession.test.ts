import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindExecutorSession,
  buildExecutorSessionState,
  connectExecutorSession,
  disconnectExecutorSession,
  getExecutorSessionRuntimeState,
  subscribeExecutorSessionMessages,
  subscribeExecutorSessionLifecycle,
} from './executorSession';

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
}

const originalWebSocket = globalThis.WebSocket;
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

test.beforeEach(() => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  debuggerConfig = { ...defaultDebuggerConfig };
  connectionState = { ...defaultConnectionState };
  bindExecutorSession({
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
  const socket = getExecutorSessionRuntimeState().socket as unknown as FakeWebSocket | null;
  disconnectExecutorSession();
  socket?.emitClose();
  globalThis.WebSocket = originalWebSocket;
});

test('ignores stale socket close events after reconnecting to a new session', async () => {
  await connectExecutorSession('ws://localhost:1234');
  const firstSocket = FakeWebSocket.instances[0]!;

  await connectExecutorSession('ws://localhost:5678');
  const secondSocket = FakeWebSocket.instances[1]!;

  secondSocket.open();
  firstSocket.emitClose();

  assert.equal(getExecutorSessionRuntimeState().status, 'ready');
  assert.equal(getExecutorSessionRuntimeState().socket, secondSocket);
});

test('manual disconnect only notifies listeners once', async () => {
  let disconnectCount = 0;

  const unsubscribe = subscribeExecutorSessionLifecycle('disconnect', () => {
    disconnectCount += 1;
  });

  await connectExecutorSession('ws://localhost:9999');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  disconnectExecutorSession();
  socket.emitClose();

  unsubscribe();

  assert.equal(disconnectCount, 1);
  assert.equal(getExecutorSessionRuntimeState().status, 'idle');
  assert.equal(getExecutorSessionRuntimeState().socket, null);
});

test('unexpected disconnect notifies listeners and transitions to reconnecting', async () => {
  let disconnectCount = 0;

  const unsubscribe = subscribeExecutorSessionLifecycle('disconnect', () => {
    disconnectCount += 1;
  });

  await connectExecutorSession('ws://localhost:7777');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();
  socket.emitClose();

  unsubscribe();

  assert.equal(disconnectCount, 1);
  assert.equal(getExecutorSessionRuntimeState().status, 'reconnecting');
  assert.equal(getExecutorSessionRuntimeState().socket, null);
});

test('delivers process messages to all subscribed handlers', async () => {
  const receivedByFirst: string[] = [];
  const receivedBySecond: string[] = [];

  const unsubscribeFirst = subscribeExecutorSessionMessages((message) => {
    receivedByFirst.push(message);
  });
  const unsubscribeSecond = subscribeExecutorSessionMessages((message) => {
    receivedBySecond.push(message);
  });

  await connectExecutorSession('ws://localhost:8888');
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
  await connectExecutorSession('ws://localhost:1111');
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.open();
  firstSocket.emitMessage({
    message: 'graph-upload-allowed',
    data: undefined,
  });

  assert.equal(debuggerConfig.remoteUploadAllowed, true);

  await connectExecutorSession('ws://localhost:2222');

  assert.equal(debuggerConfig.url, 'ws://localhost:2222');
  assert.equal(debuggerConfig.remoteUploadAllowed, false);
});

test('buildExecutorSessionState derives legacy connection flags from runtime status', async () => {
  await connectExecutorSession('ws://localhost:3333');
  const socket = FakeWebSocket.instances[0]!;
  socket.open();

  const sessionState = buildExecutorSessionState(defaultDebuggerConfig, defaultConnectionState);

  assert.equal(sessionState.status, 'ready');
  assert.equal(sessionState.started, true);
  assert.equal(sessionState.reconnecting, false);
});
