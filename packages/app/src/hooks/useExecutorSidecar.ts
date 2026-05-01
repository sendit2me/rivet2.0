import {
  attachExecutorSidecarConsumer,
  createExecutorSidecarRuntimeState,
  detachExecutorSidecarConsumer,
  startExecutorSidecar,
  stopExecutorSidecar,
} from './executorSidecarRuntime.js';

export const executorSidecarRuntime = createExecutorSidecarRuntimeState();

export async function attachAndStartExecutorSidecar() {
  attachExecutorSidecarConsumer(executorSidecarRuntime);
  await startExecutorSidecar(executorSidecarRuntime);
}

export async function detachAndStopExecutorSidecar() {
  detachExecutorSidecarConsumer(executorSidecarRuntime);
  await stopExecutorSidecar(executorSidecarRuntime);
}
