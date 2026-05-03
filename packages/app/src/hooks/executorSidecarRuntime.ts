import { logRuntimeDebug } from '@rivet2/rivet-core';
import { type NativeChildProcess } from '../utils/platform/core.js';
import { createNativeSidecarCommand } from '../utils/platform/shell.js';
import { handleError } from '../utils/errorHandling.js';

const EXECUTOR_READY_MESSAGE = 'Rivet app executor websocket listening';
const EXECUTOR_READY_TIMEOUT_MS = 5000;

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
  options: { readyTimeoutMs?: number } = {},
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
      logRuntimeDebug('Starting executor sidecar.', {
        consumerCount: runtime.consumerCount,
      });

      const command = await createSidecarCommand('../../app-executor/dist/app-executor');
      const ready = createExecutorReadySignal(options.readyTimeoutMs ?? EXECUTOR_READY_TIMEOUT_MS);

      command.stdout.on('data', (data) => {
        const text = String(data);
        logRuntimeDebug('Executor sidecar stdout', {
          byteLength: text.length,
        });
        ready.accept(text);
      });

      command.stderr.on('data', (data) => {
        const text = String(data);
        logRuntimeDebug('Executor sidecar stderr', {
          byteLength: text.length,
        });
      });

      runtime.process = await command.spawn();
      const readyReason = await ready.promise;
      runtime.started = true;
      logRuntimeDebug('Executor sidecar startup gate passed.', {
        readyReason,
        consumerCount: runtime.consumerCount,
      });

      if (runtime.consumerCount === 0 && runtime.process) {
        const proc = runtime.process;
        runtime.process = null;
        runtime.started = false;
        logRuntimeDebug('Stopping executor sidecar immediately because no consumers remain.');
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

  if (runtime.startPromise) {
    await runtime.startPromise;
    if (runtime.consumerCount > 0) {
      return;
    }
  }

  const proc = runtime.process;
  runtime.process = null;
  runtime.started = false;

  if (proc) {
    logRuntimeDebug('Stopping executor sidecar.', {
      consumerCount: runtime.consumerCount,
    });
    await proc.kill();
  }
}

export function attachExecutorSidecarConsumer(runtime: ExecutorSidecarRuntimeState) {
  runtime.consumerCount += 1;
}

export function detachExecutorSidecarConsumer(runtime: ExecutorSidecarRuntimeState) {
  runtime.consumerCount = Math.max(0, runtime.consumerCount - 1);
}

function createExecutorReadySignal(timeoutMs: number) {
  let stdoutBuffer = '';
  let resolveReady!: (reason: 'ready-marker' | 'timeout') => void;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const promise = new Promise<'ready-marker' | 'timeout'>((resolve) => {
    resolveReady = (reason) => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      resolve(reason);
    };

    timeout = setTimeout(() => resolveReady('timeout'), timeoutMs);
  });

  return {
    promise,
    accept(text: string) {
      stdoutBuffer = `${stdoutBuffer}${text}`.slice(-4096);
      if (stdoutBuffer.includes(EXECUTOR_READY_MESSAGE)) {
        resolveReady('ready-marker');
      }
    },
  };
}
