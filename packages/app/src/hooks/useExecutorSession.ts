import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import { useExecutorSidecar } from './useExecutorSidecar';
import { useRemoteDebugger } from './useRemoteDebugger';

export function useExecutorSession(selectedExecutor: 'browser' | 'nodejs') {
  const runtime = useExecutorSessionRuntime();
  const remoteDebugger = useRemoteDebugger();

  useExecutorSidecar({ enabled: selectedExecutor === 'nodejs' });

  useEffect(() => {
    if (selectedExecutor === 'nodejs') {
      void runtime.connectInternal();
    } else {
      runtime.disconnect();
    }

    return () => {
      runtime.disconnect();
    };
  }, [runtime, selectedExecutor]);

  return remoteDebugger;
}

export function useExecutorSessionState() {
  const runtime = useExecutorSessionRuntime();
  const debuggerConfig = useAtomValue(remoteDebuggerConfigState);
  const connectionState = useAtomValue(remoteDebuggerConnectionState);
  return runtime.buildSessionState(debuggerConfig, connectionState);
}
