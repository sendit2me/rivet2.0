import type { ChartNode, NodeId } from '@valerypopoff/rivet2-core';

export function getDraggingViewportNodeIds({
  draggedSourceNodeIds,
  draggingNodes,
}: {
  draggedSourceNodeIds: readonly NodeId[];
  draggingNodes: readonly Pick<ChartNode, 'id'>[];
}): NodeId[] {
  return [...new Set([...draggedSourceNodeIds, ...draggingNodes.map((node) => node.id)])];
}
