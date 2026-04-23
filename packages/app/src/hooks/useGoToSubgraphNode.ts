import { type ChartNode, type SubGraphNode } from '@ironclad/rivet-core';
import { useAtomValue } from 'jotai';
import { createSubgraphGraphViewContext } from '../domain/graphEditing/navigationActions.js';
import { graphMetadataState } from '../state/graph.js';
import { projectState } from '../state/savedGraphs.js';
import { useLoadGraph } from './useLoadGraph.js';
import { useStableCallback } from './useStableCallback.js';

export function useGoToSubgraphNode() {
  const loadGraph = useLoadGraph();
  const project = useAtomValue(projectState);
  const graph = useAtomValue(graphMetadataState);

  return useStableCallback((node: ChartNode | undefined) => {
    if (node?.type !== 'subGraph') {
      return;
    }

    const subGraphNode = node as SubGraphNode;
    const graphId = subGraphNode.data.graphId;
    const subgraph = project.graphs[graphId];

    if (!subgraph || !graph?.id) {
      return;
    }

    loadGraph(subgraph, {
      graphView: createSubgraphGraphViewContext({
        graphId,
        parentGraphId: graph.id,
        parentNodeId: subGraphNode.id,
      }),
    });
  });
}
