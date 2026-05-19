import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExternalDebuggerTarget,
  createInternalDesktopExecutorTarget,
  createInternalHostedExecutorTarget,
  executorSessionTargetsEqual,
  getExecutorSessionTargetLabel,
  INTERNAL_EXECUTOR_URL,
  isInternalExecutorTarget,
} from './executorSessionTarget.js';

test('executor session targets keep URL and product identity separate', () => {
  const external = createExternalDebuggerTarget('ws://executor.example/internal');
  const hosted = createInternalHostedExecutorTarget('ws://executor.example/internal');

  assert.equal(executorSessionTargetsEqual(external, hosted), false);
  assert.equal(isInternalExecutorTarget(external), false);
  assert.equal(isInternalExecutorTarget(hosted), true);
  assert.equal(getExecutorSessionTargetLabel(hosted), 'internal-hosted-executor');
});

test('executor session target factories preserve desktop and debugger defaults', () => {
  const desktop = createInternalDesktopExecutorTarget();
  const external = createExternalDebuggerTarget('');

  assert.deepEqual(desktop, {
    type: 'internal-desktop',
    url: INTERNAL_EXECUTOR_URL,
  });
  assert.deepEqual(external, {
    type: 'external-debugger',
    url: 'ws://localhost:21888',
  });
});
