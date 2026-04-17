import { useStore } from 'jotai';
import { graphState } from '../state/graph.js';
import { savedGraphsState } from '../state/savedGraphs.js';
import { useStableCallback } from './useStableCallback.js';
import { prepareCurrentGraphForSave } from '../utils/currentGraphSave.js';

export function useSaveCurrentGraph() {
  const store = useStore();

  return useStableCallback(() => {
    const graphData = store.get(graphState);
    const savedGraphs = store.get(savedGraphsState);
    const prepared = prepareCurrentGraphForSave(graphData, savedGraphs);

    if (!prepared) {
      return undefined;
    }

    store.set(graphState, prepared.currentGraph);
    store.set(savedGraphsState, prepared.savedGraphs);

    return prepared.currentGraph;
  });
}
