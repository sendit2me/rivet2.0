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

  await startExecutorSidecar(
    runtime,
    async () =>
      ({
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
      }) as any,
    { readyTimeoutMs: 0 },
  );

  assert.equal(runtime.started, true);
  assert.equal(spawnCount, 1);

  detachExecutorSidecarConsumer(runtime);
  await stopExecutorSidecar(runtime);

  assert.equal(runtime.started, false);
  assert.equal(killCount, 1);
});

test('sidecar runtime reuses pending startup across quick detach and reattach', async () => {
  let spawnCount = 0;
  let stdoutDataHandler: ((data: string) => void) | undefined;
  const runtime = createExecutorSidecarRuntimeState();

  attachExecutorSidecarConsumer(runtime);

  const firstStart = startExecutorSidecar(
    runtime,
    async () =>
      ({
        stdout: {
          on: (_event: string, handler: (data: string) => void) => {
            stdoutDataHandler = handler;
          },
        },
        stderr: { on: () => {} },
        spawn: async () => {
          spawnCount += 1;
          return {
            kill: async () => {},
          } as any;
        },
      }) as any,
    { readyTimeoutMs: 1000 },
  );

  await new Promise((resolve) => setTimeout(resolve, 0));

  detachExecutorSidecarConsumer(runtime);
  const stop = stopExecutorSidecar(runtime);

  attachExecutorSidecarConsumer(runtime);
  const secondStart = startExecutorSidecar(runtime);

  stdoutDataHandler?.('Rivet app executor websocket listening on 127.0.0.1:21889');
  await Promise.all([firstStart, stop, secondStart]);

  assert.equal(spawnCount, 1);
  assert.equal(runtime.started, true);

  detachExecutorSidecarConsumer(runtime);
  await stopExecutorSidecar(runtime);
});

test('sidecar stderr is telemetry and does not report renderer errors', async () => {
  let stderrDataHandler: ((data: string) => void) | undefined;
  const runtime = createExecutorSidecarRuntimeState();
  const originalConsoleError = console.error;
  let consoleErrorCount = 0;

  console.error = () => {
    consoleErrorCount += 1;
  };

  try {
    attachExecutorSidecarConsumer(runtime);

    await startExecutorSidecar(
      runtime,
      async () =>
        ({
          stdout: { on: () => {} },
          stderr: {
            on: (_event: string, handler: (data: string) => void) => {
              stderrDataHandler = handler;
            },
          },
          spawn: async () =>
            ({
              kill: async () => {},
            }) as any,
        }) as any,
      { readyTimeoutMs: 0 },
    );

    stderrDataHandler?.('expected provider failure log');

    assert.equal(consoleErrorCount, 0);
  } finally {
    console.error = originalConsoleError;
    detachExecutorSidecarConsumer(runtime);
    await stopExecutorSidecar(runtime);
  }
});

test('sidecar runtime waits for ready stdout before reporting started', async () => {
  let stdoutDataHandler: ((data: string) => void) | undefined;
  const runtime = createExecutorSidecarRuntimeState();

  attachExecutorSidecarConsumer(runtime);

  try {
    const startPromise = startExecutorSidecar(
      runtime,
      async () =>
        ({
          stdout: {
            on: (_event: string, handler: (data: string) => void) => {
              stdoutDataHandler = handler;
            },
          },
          stderr: { on: () => {} },
          spawn: async () =>
            ({
              kill: async () => {},
            }) as any,
        }) as any,
      { readyTimeoutMs: 1000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(runtime.started, false);

    stdoutDataHandler?.('Rivet app executor websocket listening on 127.0.0.1:21889');
    await startPromise;

    assert.equal(runtime.started, true);
  } finally {
    detachExecutorSidecarConsumer(runtime);
    await stopExecutorSidecar(runtime);
  }
});
