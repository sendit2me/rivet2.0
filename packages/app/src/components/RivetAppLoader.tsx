import { useState } from 'react';
import { allInitializeStoreFns } from '../state/storage';
import useAsyncEffect from 'use-async-effect';
import { RivetApp } from './RivetApp';
import { useAtomValue } from 'jotai';
import { settingsState } from '../state/settings.js';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins.js';
import { fillMissingSettingsFromEnvironmentVariables } from '../utils/tauri.js';
import { prefetchChatV2DiscoveredModelOptions } from '../utils/chatV2ModelCatalog.js';

export const RivetAppLoader = () => {
  const [isLoading, setIsLoading] = useState(true);
  const settings = useAtomValue(settingsState);
  const plugins = useDependsOnPlugins();

  useAsyncEffect(async () => {
    for (const initializeFn of allInitializeStoreFns) {
      await initializeFn();
    }

    setIsLoading(false);
  }, []);

  useAsyncEffect(async () => {
    if (isLoading) {
      return;
    }

    const resolvedSettings = await fillMissingSettingsFromEnvironmentVariables(settings, plugins);
    prefetchChatV2DiscoveredModelOptions({
      settings: resolvedSettings,
      plugins,
    });
  }, [isLoading, plugins, settings]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return <RivetApp />;
};
