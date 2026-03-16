import { useEffect } from 'react';
import { useExecutorSidecar } from './useExecutorSidecar';
import { connectInternalExecutorSession, disconnectExecutorSession } from './executorSession';
import { useRemoteDebugger } from './useRemoteDebugger';

export function useExecutorSession(selectedExecutor: 'browser' | 'nodejs') {
  const remoteDebugger = useRemoteDebugger();

  useExecutorSidecar({ enabled: selectedExecutor === 'nodejs' });

  useEffect(() => {
    if (selectedExecutor === 'nodejs') {
      void connectInternalExecutorSession();
    } else {
      disconnectExecutorSession();
    }

    return () => {
      disconnectExecutorSession();
    };
  }, [selectedExecutor]);

  return remoteDebugger;
}

export function useExecutorSessionState() {
  return useRemoteDebugger().sessionState;
}
