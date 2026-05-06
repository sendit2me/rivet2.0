import { createContext, useContext, useEffect, useMemo, type FC, type ReactNode } from 'react';
import { useSetAtom } from 'jotai';
import { createExecutorSessionRuntime, type ExecutorSessionRuntime } from '../hooks/executorSession.js';
import { executorSessionRevisionState } from '../state/execution.js';
import { useDatasetProvider } from './ProvidersContext.js';

const ExecutorSessionRuntimeContext = createContext<ExecutorSessionRuntime | null>(null);
const ExecutorSessionHostConfigContext = createContext<ExecutorSessionHostConfig | undefined>(undefined);

export type ExecutorSessionHostConfig = {
  /**
   * Hosted wrappers can provide the editor executor websocket URL here. When
   * set, Node executor mode connects to this URL instead of starting a Tauri
   * sidecar, so browser-hosted Rivet shells can use the same executor hooks as
   * the desktop app.
   */
  internalExecutorUrl?: string;
};

export function useExecutorSessionRuntime(): ExecutorSessionRuntime {
  const context = useContext(ExecutorSessionRuntimeContext);

  if (!context) {
    throw new Error('useExecutorSessionRuntime must be used within an ExecutorSessionProvider');
  }

  return context;
}

export function useExecutorSessionHostConfig(): ExecutorSessionHostConfig | undefined {
  return useContext(ExecutorSessionHostConfigContext);
}

export const ExecutorSessionProvider: FC<{ children: ReactNode; hostConfig?: ExecutorSessionHostConfig }> = ({
  children,
  hostConfig,
}) => {
  const datasetProvider = useDatasetProvider();
  const bumpExecutorSessionRevision = useSetAtom(executorSessionRevisionState);

  const runtime = useMemo(
    () =>
      createExecutorSessionRuntime({
        onStateChange: () => {
          bumpExecutorSessionRevision((revision) => revision + 1);
        },
      }),
    [bumpExecutorSessionRevision],
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

  return (
    <ExecutorSessionHostConfigContext.Provider value={hostConfig}>
      <ExecutorSessionRuntimeContext.Provider value={runtime}>{children}</ExecutorSessionRuntimeContext.Provider>
    </ExecutorSessionHostConfigContext.Provider>
  );
};
