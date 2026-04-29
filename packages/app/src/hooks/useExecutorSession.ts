import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import { defaultExecutorState } from '../state/settings.js';
import { isInTauri } from '../utils/platform/core.js';
import {
  attachAndStartExecutorSidecar,
  detachAndStopExecutorSidecar,
  executorSidecarRuntime,
} from './useExecutorSidecar';
import { useRemoteDebugger } from './useRemoteDebugger';

export function useExecutorSession(selectedExecutor: 'browser' | 'nodejs') {
  const runtime = useExecutorSessionRuntime();
  const remoteDebugger = useRemoteDebugger();
  const setDefaultExecutor = useSetAtom(defaultExecutorState);

  useEffect(() => {
    if (selectedExecutor !== 'nodejs') {
      runtime.disconnect();
      return () => {
        runtime.disconnect();
      };
    }

    if (!isInTauri()) {
      setDefaultExecutor('browser');
      runtime.disconnect();
      return;
    }

    let cancelled = false;

    void (async () => {
      await attachAndStartExecutorSidecar();

      if (!cancelled && executorSidecarRuntime.started) {
        await runtime.connectInternal();
      }
    })();

    return () => {
      cancelled = true;
      runtime.disconnect();
      void detachAndStopExecutorSidecar();
    };
  }, [runtime, selectedExecutor, setDefaultExecutor]);

  return remoteDebugger;
}

export function useExecutorSessionState() {
  const runtime = useExecutorSessionRuntime();
  const debuggerConfig = useAtomValue(remoteDebuggerConfigState);
  const connectionState = useAtomValue(remoteDebuggerConnectionState);
  return runtime.buildSessionState(debuggerConfig, connectionState);
}
