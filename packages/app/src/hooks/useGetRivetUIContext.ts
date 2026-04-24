import { type ChartNode, type RivetUIContext, getPluginConfig } from '@ironclad/rivet-core';
import { defaultExecutorState, settingsState } from '../state/settings';
import { fillMissingSettingsFromEnvironmentVariables } from '../utils/tauri';
import { useDependsOnPlugins } from './useDependsOnPlugins';
import { useProjectNodeRegistry } from './useProjectNodeRegistry';
import { projectState, referencedProjectsState } from '../state/savedGraphs';
import { graphState } from '../state/graph';
import { useStableCallback } from './useStableCallback';
import { useAtomValue } from 'jotai';
import { TauriNativeApi } from '../model/native/TauriNativeApi';
import { useDatasetProvider } from '../providers/ProvidersContext';
import { getChatV2DiscoveredModelOptions } from '../utils/chatV2ModelCatalog.js';

export function useGetRivetUIContext() {
  const datasetProvider = useDatasetProvider();
  const selectedExecutor = useAtomValue(defaultExecutorState);
  const settings = useAtomValue(settingsState);
  const plugins = useDependsOnPlugins();
  const projectNodeRegistry = useProjectNodeRegistry();
  const project = useAtomValue(projectState);
  const graph = useAtomValue(graphState);
  const referencedProjects = useAtomValue(referencedProjectsState);

  return useStableCallback(async ({ node }: { node?: ChartNode }) => {
    const resolvedSettings = await fillMissingSettingsFromEnvironmentVariables(settings, plugins);
    let getPluginConfigFn: RivetUIContext['getPluginConfig'] = () => undefined;
    if (node) {
      const nodePlugin = projectNodeRegistry.getPluginFor(node?.type);
      if (nodePlugin) {
        getPluginConfigFn = (name) => getPluginConfig(nodePlugin, resolvedSettings, name);
      }
    }

    const context = {
      datasetProvider,
      executor: selectedExecutor,
      settings: resolvedSettings,
      project,
      graph,
      node,
      getPluginConfig: getPluginConfigFn,
      getChatModelOptions: (provider: 'openai' | 'anthropic' | 'google') =>
        getChatV2DiscoveredModelOptions(provider, {
          settings: resolvedSettings,
          plugins,
        }),
      nativeApi: new TauriNativeApi(),
      referencedProjects,
    };

    return context as RivetUIContext;
  });
}
