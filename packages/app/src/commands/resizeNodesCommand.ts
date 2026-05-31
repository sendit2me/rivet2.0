import { type ChartNode, type CommentNode, type NodeId } from '@valerypopoff/rivet2-core';
import { useSetAtom } from 'jotai';
import { useCommand } from './Command';
import { nodesState } from '../state/graph';
import type { NodeResizeBounds } from '../utils/nodeResize.js';

export type NodeResizeChange = {
  nodeId: NodeId;
  nextBounds: NodeResizeBounds;
  previousNode: ChartNode;
};

function applyResizeBoundsToNode(node: ChartNode, nextBounds: NodeResizeBounds): ChartNode {
  const nextNode: ChartNode = {
    ...node,
    visualData: {
      ...node.visualData,
      x: nextBounds.x,
      y: nextBounds.y ?? node.visualData.y,
      width: nextBounds.width,
    },
  };

  if (nextNode.type === 'comment' && nextBounds.height != null) {
    return {
      ...nextNode,
      data: {
        ...(nextNode as CommentNode).data,
        height: nextBounds.height,
      },
    } as ChartNode;
  }

  return nextNode;
}

export function useResizeNodesCommand() {
  const setNodes = useSetAtom(nodesState);

  return useCommand<
    {
      changes: NodeResizeChange[];
    },
    null
  >({
    type: 'resizeNodes',
    apply(params, _appliedData, currentState) {
      const nextBoundsByNodeId = new Map(params.changes.map((change) => [change.nodeId, change.nextBounds]));
      const currentNodeIds = new Set(currentState.nodes.map((node) => node.id));
      for (const change of params.changes) {
        if (!currentNodeIds.has(change.nodeId)) {
          throw new Error(`Node with id ${change.nodeId} not found`);
        }
      }

      setNodes(
        currentState.nodes.map((node) => {
          const nextBounds = nextBoundsByNodeId.get(node.id);
          return nextBounds ? applyResizeBoundsToNode(node, nextBounds) : node;
        }),
      );

      return null;
    },
    undo(params, _appliedData, currentState) {
      const previousNodesByNodeId = new Map(
        params.changes.map((change) => [change.nodeId, structuredClone(change.previousNode)]),
      );

      setNodes(currentState.nodes.map((node) => previousNodesByNodeId.get(node.id) ?? node));
    },
  });
}
