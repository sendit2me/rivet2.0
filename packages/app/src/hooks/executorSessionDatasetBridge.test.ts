import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatasetRequestPayload } from '@valerypopoff/rivet2-core';
import { createExternalDebuggerTarget } from './executorSessionTarget.js';
import { handleExecutorDatasetRequest, processExecutorDatasetRequest } from './executorSessionDatasetBridge.js';

class FakeWebSocket {
  static readonly OPEN = 1;

  readonly url = 'ws://debugger.example/latest';
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }
}

const originalWebSocket = globalThis.WebSocket;

test.beforeEach(() => {
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
});

test.afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
});

test('executor dataset bridge sends provider results through the existing dataset response message', async () => {
  const socket = new FakeWebSocket();
  const target = createExternalDebuggerTarget('ws://debugger.example/latest');

  await processExecutorDatasetRequest({
    data: {
      payload: { id: 'dataset-1' },
      requestId: 'dataset-request-1',
    } as DatasetRequestPayload<unknown>,
    datasetProvider: {
      getDatasetMetadata: async (id: string) => ({ id, name: 'Dataset' }),
    } as never,
    message: 'datasets:get-metadata',
    socket: socket as unknown as WebSocket,
    target,
  });

  assert.deepEqual(socket.sent.map((message) => JSON.parse(message)), [
    {
      data: {
        payload: { id: 'dataset-1', name: 'Dataset' },
        requestId: 'dataset-request-1',
      },
      type: 'datasets:response',
    },
  ]);
});

test('executor dataset bridge ignores dataset requests when no provider is available', () => {
  const socket = new FakeWebSocket();

  handleExecutorDatasetRequest({
    data: {
      payload: { id: 'dataset-1' },
      requestId: 'dataset-request-1',
    } as DatasetRequestPayload<unknown>,
    datasetProvider: null,
    message: 'datasets:get-data',
    socket: socket as unknown as WebSocket,
    target: createExternalDebuggerTarget('ws://debugger.example/latest'),
  });

  assert.deepEqual(socket.sent, []);
});
