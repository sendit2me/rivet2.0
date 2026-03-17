import { type NativeChildProcess } from '../utils/platform/core.js';
import { createNativeSidecarCommand } from '../utils/platform/shell.js';
import { handleError } from '../utils/errorHandling.js';

export type ExecutorSidecarRuntimeState = {
  started: boolean;
  process: NativeChildProcess | null;
  startPromise: Promise<void> | null;
  consumerCount: number;
};

export function createExecutorSidecarRuntimeState(): ExecutorSidecarRuntimeState {
  return {
    started: false,
    process: null,
    startPromise: null,
    consumerCount: 0,
  };
}

export async function startExecutorSidecar(
  runtime: ExecutorSidecarRuntimeState,
  createSidecarCommand: typeof createNativeSidecarCommand = createNativeSidecarCommand,
) {
  try {
    if (runtime.started) {
      return;
    }

    if (runtime.startPromise) {
      await runtime.startPromise;
      return;
    }

    runtime.startPromise = (async () => {
      const command = await createSidecarCommand('../../app-executor/dist/app-executor');

      command.stdout.on('data', (data) => {
        console.log('sidecar stdout', data);
      });

      command.stderr.on('data', (data) => {
        handleError(new Error(String(data)), 'Executor sidecar stderr', {
          metadata: {
            consumerCount: runtime.consumerCount,
          },
          toastError: false,
        });
      });

      runtime.started = true;
      runtime.process = await command.spawn();

      if (runtime.consumerCount === 0 && runtime.process) {
        const proc = runtime.process;
        runtime.process = null;
        runtime.started = false;
        await proc.kill();
      }
    })();

    await runtime.startPromise;
    runtime.startPromise = null;
  } catch (error) {
    runtime.startPromise = null;
    runtime.started = false;
    runtime.process = null;
    handleError(error, 'Failed to start executor sidecar', {
      metadata: {
        consumerCount: runtime.consumerCount,
      },
      toastError: false,
    });
  }
}

export async function stopExecutorSidecar(runtime: ExecutorSidecarRuntimeState) {
  if (runtime.consumerCount > 0) {
    return;
  }

  const proc = runtime.process;
  runtime.process = null;
  runtime.started = false;
  runtime.startPromise = null;

  if (proc) {
    await proc.kill();
  }
}

export function attachExecutorSidecarConsumer(runtime: ExecutorSidecarRuntimeState) {
  runtime.consumerCount += 1;
}

export function detachExecutorSidecarConsumer(runtime: ExecutorSidecarRuntimeState) {
  runtime.consumerCount = Math.max(0, runtime.consumerCount - 1);
}
