import { useSetAtom } from 'jotai';
import { type NodeGraph, emptyNodeGraph } from '@valerypopoff/rivet2-core';
import { graphState } from '../state/graph.js';
import { savedGraphsState } from '../state/savedGraphs.js';
import { useCallback } from 'react';
import { frozenNodeOutputsState } from '../state/dataFlow.js';
import { removeFrozenNodeOutputsForGraphs } from '../utils/frozenNodeOutputs.js';

export function useDeleteGraph() {
  const setGraph = useSetAtom(graphState);
  const setSavedGraphs = useSetAtom(savedGraphsState);
  const setFrozenNodeOutputs = useSetAtom(frozenNodeOutputsState);

  return useCallback(
    (savedGraph: NodeGraph) => {
      if (savedGraph.metadata?.id) {
        setSavedGraphs((prev) => prev.filter((g) => g.metadata?.id !== savedGraph.metadata?.id));
        setFrozenNodeOutputs((prev) => removeFrozenNodeOutputsForGraphs(prev, [savedGraph.metadata!.id!]));
        setGraph(emptyNodeGraph());
      }
    },
    [setFrozenNodeOutputs, setGraph, setSavedGraphs],
  );
}
