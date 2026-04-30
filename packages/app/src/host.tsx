import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ExecutorSessionProvider, type ExecutorSessionHostConfig } from './providers/ExecutorSessionContext.js';
import { ProvidersProvider, type Providers } from './providers/ProvidersContext.js';
import { RivetAppLoader } from './components/RivetAppLoader.js';

export type RivetAppHostProps = {
  children?: ReactNode;
  executor?: ExecutorSessionHostConfig;
  loadingFallback?: ReactNode;
  providers?: Providers;
  queryClient?: QueryClient;
};

/**
 * Stable embedding shell for hosted/wrapper applications that mount Rivet's app
 * UI from source. Use this instead of rendering RivetApp directly so required
 * providers and async storage bootstrap stay in sync with the desktop app.
 */
export function RivetAppHost({
  children,
  executor,
  loadingFallback,
  providers,
  queryClient,
}: RivetAppHostProps) {
  const [defaultQueryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient ?? defaultQueryClient}>
      <ProvidersProvider providers={providers}>
        <ExecutorSessionProvider hostConfig={executor}>
          <RivetAppLoader loadingFallback={loadingFallback}>{children}</RivetAppLoader>
        </ExecutorSessionProvider>
      </ProvidersProvider>
    </QueryClientProvider>
  );
}

export { RivetApp } from './components/RivetApp.js';
export { RivetAppLoader } from './components/RivetAppLoader.js';
export {
  ExecutorSessionProvider,
  useExecutorSessionHostConfig,
  useExecutorSessionRuntime,
  type ExecutorSessionHostConfig,
} from './providers/ExecutorSessionContext.js';
export {
  getDefaultProviders,
  ProvidersProvider,
  useAudioProvider,
  useDataRefs,
  useDatasetProvider,
  useIOProvider,
  useProviders,
  type AppDatasetProvider,
  type DataRefReader,
  type DataRefStore,
  type Providers,
} from './providers/ProvidersContext.js';
export {
  createExecutorSessionRuntime,
  DEFAULT_REMOTE_DEBUGGER_URL,
  INTERNAL_EXECUTOR_URL,
  type ExecutorSessionRuntime,
  type ExecutorSessionState,
  type ExecutorSessionStatus,
  type PendingGraphExecution,
} from './hooks/executorSession.js';
export {
  attachAndStartExecutorSidecar,
  detachAndStopExecutorSidecar,
  executorSidecarRuntime,
} from './hooks/useExecutorSidecar.js';
export { fillMissingSettingsFromEnvironmentVariables, getEnvVar, isInTauri } from './utils/tauri.js';
export { getLLMChatV2CustomProviderApiKeyEnvVarNames } from './utils/chatV2CustomProviderEnv.js';
