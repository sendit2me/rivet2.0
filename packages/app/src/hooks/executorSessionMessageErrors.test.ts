import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureConsoleErrors,
  FakeWebSocket,
  installExecutorSessionTestHooks,
  runtime,
} from './executorSessionTestUtils';

installExecutorSessionTestHooks();

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
