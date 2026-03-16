import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { useDatasetProvider } from '../providers/ProvidersContext.js';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import {
  bindExecutorSession,
  buildExecutorSessionState,
  connectInternalExecutorSession,
  disconnectExecutorSession,
} from './executorSession';
import { useExecutorSidecar } from './useExecutorSidecar';
import { useRemoteDebugger } from './useRemoteDebugger';

export function useExecutorSession(selectedExecutor: 'browser' | 'nodejs') {
  const datasetProvider = useDatasetProvider();
  const [, setDebuggerConfig] = useAtom(remoteDebuggerConfigState);
  const [, setConnectionState] = useAtom(remoteDebuggerConnectionState);
  const remoteDebugger = useRemoteDebugger();

  useExecutorSidecar({ enabled: selectedExecutor === 'nodejs' });

  useEffect(() => {
    bindExecutorSession({
      datasetProvider,
      setDebuggerConfig,
      setConnectionState,
    });
  }, [datasetProvider, setConnectionState, setDebuggerConfig]);

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
  const debuggerConfig = useAtomValue(remoteDebuggerConfigState);
  const connectionState = useAtomValue(remoteDebuggerConnectionState);
  return buildExecutorSessionState(debuggerConfig, connectionState);
}
