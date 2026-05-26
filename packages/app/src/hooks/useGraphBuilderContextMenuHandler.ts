import { P, match } from 'ts-pattern';
import { useStableCallback } from './useStableCallback';
import { type ChartNode, type NodeId, type GraphId } from '@valerypopoff/rivet2-core';
import { type ContextMenuContext } from '../components/ContextMenu';
import { createRootGraphViewContext } from '../domain/graphEditing/navigationActions.js';
import { editingNodeState } from '../state/graphBuilder';
import { projectState } from '../state/savedGraphs';
import { useCanvasPositioning } from './useCanvasPositioning';
import { useFactorIntoSubgraph } from './useFactorIntoSubgraph';
import { useGraphExecutor } from './useGraphExecutor';
import { useLoadGraph } from './useLoadGraph';
import { usePasteNodes } from './usePasteNodes';
import { graphMetadataState, nodesByIdState } from '../state/graph';
import { useCopyNodes } from './useCopyNodes';
import { useDuplicateNode } from './useDuplicateNode';
import { useAtomValue, useSetAtom } from 'jotai';
import { useAddNodeCommand } from '../commands/addNodeCommand';
import { useDeleteNodesCommand } from '../commands/deleteNodeCommand';
import { copyToClipboard } from '../utils/copyToClipboard';
import { useGoToSubgraphNode } from './useGoToSubgraphNode.js';
import { useFrozenNodeOutputActions } from './useFrozenNodeOutputActions.js';

export function useGraphBuilderContextMenuHandler() {
  const { clientToCanvasPosition } = useCanvasPositioning();
  const loadGraph = useLoadGraph();
  const project = useAtomValue(projectState);
  const { tryRunGraph } = useGraphExecutor();
  const pasteNodes = usePasteNodes();
  const copyNodes = useCopyNodes();
  const duplicateNode = useDuplicateNode();
  const factorIntoSubgraph = useFactorIntoSubgraph();
  const setEditingNodeId = useSetAtom(editingNodeState);
  const nodesById = useAtomValue(nodesByIdState);
  const graphId = useAtomValue(graphMetadataState)?.id;
  const removeNodes = useDeleteNodesCommand();
  const goToSubgraphNode = useGoToSubgraphNode();
  const { freezeNode, unfreezeNode } = useFrozenNodeOutputActions();

  const addNode = useAddNodeCommand();

  return useStableCallback(
    (menuItemId: string, data: unknown, context: ContextMenuContext, meta: { x: number; y: number }) => {
      match(menuItemId)
        .with(P.string.startsWith('add-node:'), () => {
          const nodeType = data as string;
          addNode({
            nodeType,
            position: clientToCanvasPosition(meta.x, meta.y),
          });
        })
        .with('node-delete', () => {
          const { nodeId: toDeleteNodeId } = context.data as { nodeId: NodeId };
          removeNodes({ nodeIds: [toDeleteNodeId] });
        })
        .with('paste', () => {
          pasteNodes(meta);
        })
        .with('node-edit', () => {
          const { nodeId } = context.data as { nodeId: NodeId };
          setEditingNodeId(nodeId);
        })
        .with('node-duplicate', () => {
          const { nodeId } = context.data as { nodeId: NodeId };
          duplicateNode(nodeId);
        })
        .with('nodes-factor-into-subgraph', () => {
          factorIntoSubgraph();
        })
        .with('node-go-to-subgraph', () => {
          const { nodeId } = context.data as { nodeId: NodeId };
          goToSubgraphNode(nodesById[nodeId]);
        })
        .with(P.string.startsWith('go-to-graph:'), () => {
          const graphId = data as GraphId;
          const graph = project.graphs[graphId];
          if (graph) {
            loadGraph(graph, { graphView: createRootGraphViewContext(graphId) });
          }
        })
        .with('node-run-to-here', () => {
          const { nodeId } = context.data as { nodeId: NodeId };

          tryRunGraph({ to: [nodeId] });
        })
        .with('node-run-from-here', () => {
          const { nodeId } = context.data as { nodeId: NodeId };

          tryRunGraph({ from: nodeId });
        })
        .with('node-freeze', () => {
          const { nodeId, nodeType } = context.data as { nodeId: NodeId; nodeType: ChartNode['type'] };
          if (graphId) {
            freezeNode(graphId, nodeId, nodeType);
          }
        })
        .with('node-unfreeze', () => {
          const { nodeId } = context.data as { nodeId: NodeId };
          if (graphId) {
            unfreezeNode(graphId, nodeId);
          }
        })
        .with('node-copy', () => {
          const { nodeId } = context.data as { nodeId: NodeId };
          copyNodes(nodeId);
        })
        .otherwise(() => {
          console.log('Unknown menu item selected', menuItemId);
        });
    },
  );
}
