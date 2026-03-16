import { useEffect } from 'react';
import {
  attachExecutorSidecarConsumer,
  createExecutorSidecarRuntimeState,
  detachExecutorSidecarConsumer,
  startExecutorSidecar,
  stopExecutorSidecar,
} from './executorSidecarRuntime.js';

const runtime = createExecutorSidecarRuntimeState();

export function useExecutorSidecar(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    attachExecutorSidecarConsumer(runtime);

    void startExecutorSidecar(runtime);

    return () => {
      detachExecutorSidecarConsumer(runtime);
      void stopExecutorSidecar(runtime);
    };
  }, [enabled]);
}
