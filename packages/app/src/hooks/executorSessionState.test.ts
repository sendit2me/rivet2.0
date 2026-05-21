import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeWebSocket, installExecutorSessionTestHooks, runtime, sessionRevision } from './executorSessionTestUtils';

installExecutorSessionTestHooks();

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
  assert.deepEqual(
    socket.sent.map((message) => JSON.parse(message)),
    [{ type: 'abort' }],
  );
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
