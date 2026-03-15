import { type ChartNode, getPluginConfig, globalRivetNodeRegistry } from '@ironclad/rivet-core';
import { defaultExecutorState, settingsState } from '../state/settings';
import { type RivetUIContext } from '../../../core/src/model/RivetUIContext';
import { fillMissingSettingsFromEnvironmentVariables } from '../utils/tauri';
import { useDependsOnPlugins } from './useDependsOnPlugins';
import { projectState, referencedProjectsState } from '../state/savedGraphs';
import { graphState } from '../state/graph';
import { useStableCallback } from './useStableCallback';
import { useAtomValue } from 'jotai';
import { TauriNativeApi } from '../model/native/TauriNativeApi';
import { useDatasetProvider } from '../providers/ProvidersContext';

export function useGetRivetUIContext() {
  const datasetProvider = useDatasetProvider();
  const selectedExecutor = useAtomValue(defaultExecutorState);
  const settings = useAtomValue(settingsState);
  const plugins = useDependsOnPlugins();
  const project = useAtomValue(projectState);
  const graph = useAtomValue(graphState);
  const referencedProjects = useAtomValue(referencedProjectsState);

  return useStableCallback(async ({ node }: { node?: ChartNode }) => {
    let getPluginConfigFn: RivetUIContext['getPluginConfig'] = () => undefined;
    if (node) {
      const nodePlugin = globalRivetNodeRegistry.getPluginFor(node?.type);
      if (nodePlugin) {
        getPluginConfigFn = (name) => getPluginConfig(nodePlugin, settings, name);
      }
    }

    const context: RivetUIContext = {
      datasetProvider,
      executor: selectedExecutor,
      settings: await fillMissingSettingsFromEnvironmentVariables(settings, plugins),
      project,
      graph,
      node,
      getPluginConfig: getPluginConfigFn,
      nativeApi: new TauriNativeApi(),
      referencedProjects,
    };

    return context;
  });
}
