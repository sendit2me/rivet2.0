import { createContext, useContext, useEffect, useMemo, type FC, type ReactNode } from 'react';
import { useAtom } from 'jotai';
import { createExecutorSessionRuntime, type ExecutorSessionRuntime } from '../hooks/executorSession.js';
import { remoteDebuggerConfigState, remoteDebuggerConnectionState } from '../state/execution.js';
import { useDatasetProvider } from './ProvidersContext.js';

const ExecutorSessionRuntimeContext = createContext<ExecutorSessionRuntime | null>(null);

export function useExecutorSessionRuntime(): ExecutorSessionRuntime {
  const context = useContext(ExecutorSessionRuntimeContext);

  if (!context) {
    throw new Error('useExecutorSessionRuntime must be used within an ExecutorSessionProvider');
  }

  return context;
}

export const ExecutorSessionProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const datasetProvider = useDatasetProvider();
  const [, setDebuggerConfig] = useAtom(remoteDebuggerConfigState);
  const [, setConnectionState] = useAtom(remoteDebuggerConnectionState);

  const runtime = useMemo(
    () =>
      createExecutorSessionRuntime({
        setDebuggerConfig,
        setConnectionState,
      }),
    [setConnectionState, setDebuggerConfig],
  );

  useEffect(() => {
    runtime.setDatasetProvider(datasetProvider);

    return () => {
      runtime.setDatasetProvider(null);
    };
  }, [datasetProvider, runtime]);

  useEffect(() => {
    return () => {
      runtime.disconnect();
    };
  }, [runtime]);

  return <ExecutorSessionRuntimeContext.Provider value={runtime}>{children}</ExecutorSessionRuntimeContext.Provider>;
};
