import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutputs, FakeWebSocket, installExecutorSessionTestHooks, runtime } from './executorSessionTestUtils';

installExecutorSessionTestHooks();

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
  assert.deepEqual(runtime.getRuntimeState().target, {
    type: 'external-debugger',
    url: 'ws://debugger.example/latest',
  });
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
