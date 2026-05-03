import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { graphState } from '../state/graph.js';
import { pluginsState } from '../state/plugins.js';
import { projectPluginsState, projectState } from '../state/savedGraphs.js';
import { deriveProjectPluginSpecsFromGraphs, pluginSpecsEqual } from '../utils/pluginUsage.js';
import { useProjectNodeRegistry } from './useProjectNodeRegistry.js';

export function useSyncProjectPluginsFromGraphUsage() {
  const graph = useAtomValue(graphState);
  const pluginStates = useAtomValue(pluginsState);
  const project = useAtomValue(projectState);
  const projectNodeRegistry = useProjectNodeRegistry();
  const setProjectPlugins = useSetAtom(projectPluginsState);

  useEffect(() => {
    const nextPlugins = deriveProjectPluginSpecsFromGraphs({
      appPluginStates: pluginStates,
      currentGraph: graph,
      project,
      registry: projectNodeRegistry,
    });

    if (!pluginSpecsEqual(project.plugins, nextPlugins)) {
      setProjectPlugins(nextPlugins);
    }
  }, [graph, pluginStates, project, projectNodeRegistry, setProjectPlugins]);
}
