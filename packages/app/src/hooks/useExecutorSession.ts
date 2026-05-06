import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { useExecutorSessionHostConfig, useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import { selectedExecutorState } from '../state/settings.js';
import { isInTauri } from '../utils/platform/core.js';
import {
  attachAndStartExecutorSidecar,
  detachAndStopExecutorSidecar,
  executorSidecarRuntime,
} from './useExecutorSidecar';
import { useRemoteDebugger } from './useRemoteDebugger';
import type { DefaultExecutor } from '../state/settings.js';
import type { ExecutorSessionLifecycleEvent } from './executorSession.js';

export function shouldRestoreInternalNodeExecutorAfterExternalDebuggerDrop(options: {
  event: ExecutorSessionLifecycleEvent;
  hasInternalExecutorUrl: boolean;
  isTauri: boolean;
  selectedExecutor: DefaultExecutor;
}) {
  return (
    options.selectedExecutor === 'nodejs' &&
    options.event.reason === 'unexpected-disconnect' &&
    !options.event.isInternalExecutor &&
    (options.hasInternalExecutorUrl || options.isTauri)
  );
}

export function useExecutorSession(selectedExecutor: 'browser' | 'nodejs') {
  const runtime = useExecutorSessionRuntime();
  const hostConfig = useExecutorSessionHostConfig();
  const remoteDebugger = useRemoteDebugger();
  const setSelectedExecutor = useSetAtom(selectedExecutorState);

  useEffect(() => {
    if (selectedExecutor !== 'nodejs') {
      runtime.disconnect();
      return () => {
        runtime.disconnect();
      };
    }

    if (hostConfig?.internalExecutorUrl) {
      void runtime.connectInternal(hostConfig.internalExecutorUrl);

      return () => {
        runtime.disconnect();
      };
    }

    if (!isInTauri()) {
      setSelectedExecutor('browser');
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
  }, [hostConfig?.internalExecutorUrl, runtime, selectedExecutor, setSelectedExecutor]);

  useEffect(() => {
    return runtime.subscribeLifecycle('disconnect', (event) => {
      if (
        !shouldRestoreInternalNodeExecutorAfterExternalDebuggerDrop({
          event,
          hasInternalExecutorUrl: !!hostConfig?.internalExecutorUrl,
          isTauri: isInTauri(),
          selectedExecutor,
        })
      ) {
        return;
      }

      void runtime.connectInternal(hostConfig?.internalExecutorUrl);
    });
  }, [hostConfig?.internalExecutorUrl, runtime, selectedExecutor]);

  return remoteDebugger;
}

export function useExecutorSessionState() {
  const runtime = useExecutorSessionRuntime();
  const debuggerConfig = useAtomValue(remoteDebuggerConfigState);
  const connectionState = useAtomValue(remoteDebuggerConnectionState);
  return runtime.buildSessionState(debuggerConfig, connectionState);
}
