import { useState, type ReactNode } from 'react';
import { allInitializeStoreFns } from '../state/storage';
import useAsyncEffect from 'use-async-effect';
import { RivetApp } from './RivetApp';
import { useAtomValue } from 'jotai';
import { settingsState } from '../state/settings.js';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins.js';
import { fillMissingSettingsFromEnvironmentVariables } from '../utils/tauri.js';
import { prefetchChatV2DiscoveredModelOptions } from '../utils/chatV2ModelCatalog.js';

// Storage-backed atoms read synchronously on mount, so this subtree must stay behind the
// async hybrid-storage bootstrap or settings/theme atoms can lock in default values.
const InitializedRivetApp = ({ children }: { children?: ReactNode }) => {
  const settings = useAtomValue(settingsState);
  const plugins = useDependsOnPlugins();

  useAsyncEffect(async () => {
    const resolvedSettings = await fillMissingSettingsFromEnvironmentVariables(settings, plugins);
    prefetchChatV2DiscoveredModelOptions({
      settings: resolvedSettings,
      plugins,
    });
  }, [plugins, settings]);

  return (
    <>
      <RivetApp />
      {children}
    </>
  );
};

export const RivetAppLoader = ({
  children,
  loadingFallback = <div>Loading...</div>,
}: {
  children?: ReactNode;
  loadingFallback?: ReactNode;
}) => {
  const [isLoading, setIsLoading] = useState(true);

  useAsyncEffect(async () => {
    for (const initializeFn of allInitializeStoreFns) {
      await initializeFn();
    }

    setIsLoading(false);
  }, []);

  if (isLoading) {
    return loadingFallback;
  }

  return <InitializedRivetApp>{children}</InitializedRivetApp>;
};
