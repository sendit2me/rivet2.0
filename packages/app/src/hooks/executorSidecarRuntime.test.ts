import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachExecutorSidecarConsumer,
  createExecutorSidecarRuntimeState,
  detachExecutorSidecarConsumer,
  startExecutorSidecar,
  stopExecutorSidecar,
} from './executorSidecarRuntime';

test('sidecar runtime starts once and tracks consumer lifecycle', async () => {
  let spawnCount = 0;
  let killCount = 0;
  const runtime = createExecutorSidecarRuntimeState();

  attachExecutorSidecarConsumer(runtime);

  await startExecutorSidecar(runtime, async () => ({
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    spawn: async () => {
      spawnCount += 1;
      return {
        kill: async () => {
          killCount += 1;
        },
      } as any;
    },
  }) as any);

  assert.equal(runtime.started, true);
  assert.equal(spawnCount, 1);

  detachExecutorSidecarConsumer(runtime);
  await stopExecutorSidecar(runtime);

  assert.equal(runtime.started, false);
  assert.equal(killCount, 1);
});
