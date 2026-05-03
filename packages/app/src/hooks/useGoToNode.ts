import { type GraphId, type NodeId } from '@rivet2/rivet-core';
import { createRootGraphViewContext } from '../domain/graphEditing/navigationActions.js';
import { useStableCallback } from './useStableCallback';
import { useLoadGraph } from './useLoadGraph';
import { graphState } from '../state/graph';
import { projectState } from '../state/savedGraphs';
import { canvasPositionState } from '../state/graphBuilder';
import { useAtomValue, useSetAtom } from 'jotai';

type GoToNodeOptions = {
  graphId?: GraphId;
  zoom?: number;
  viewportCenter?: { x: number; y: number };
};

export function useGoToNode() {
  const project = useAtomValue(projectState);
  const currentGraph = useAtomValue(graphState);
  const loadGraph = useLoadGraph();
  const setPosition = useSetAtom(canvasPositionState);

  return useStableCallback((nodeId: NodeId, options?: GoToNodeOptions) => {
    const graphForNode =
      options?.graphId != null
        ? options.graphId === currentGraph.metadata?.id
          ? currentGraph
          : project.graphs[options.graphId]
        : [currentGraph, ...Object.values(project.graphs)].find((graph) => graph.nodes.some((n) => n.id === nodeId));

    if (graphForNode == null || !graphForNode.nodes.some((node) => node.id === nodeId)) {
      return;
    }

    const node = graphForNode.nodes.find((n) => n.id === nodeId)!;

    loadGraph(graphForNode, { graphView: createRootGraphViewContext(graphForNode.metadata!.id!) });

    const nodeRect = { x: node.visualData.x, y: node.visualData.y, width: node.visualData.width ?? 300, height: 300 };
    const viewportBounds = { width: window.innerWidth, height: window.innerHeight };

    const zoom = options?.zoom ?? 1;

    // Place node at the requested viewport point so overlays can reserve visible space.
    const nodeCenter = { x: nodeRect.x + nodeRect.width / 2, y: nodeRect.y + nodeRect.height / 2 };
    const viewportCenter = options?.viewportCenter ?? {
      x: viewportBounds.width / 2,
      y: viewportBounds.height / 2,
    };
    const offset = { x: viewportCenter.x / zoom - nodeCenter.x, y: viewportCenter.y / zoom - nodeCenter.y };

    setPosition({ x: offset.x, y: offset.y, zoom });
  });
}
