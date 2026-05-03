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

export function shouldFreezeViewportVisibility({
  isDraggingNode,
  isDraggingWire,
  isViewportMoving,
}: {
  isDraggingNode: boolean;
  isDraggingWire: boolean;
  isViewportMoving: boolean;
}): boolean {
  // Interactive drags need newly revealed nodes and ports to mount immediately
  // so wire previews stay accurate. Only passive viewport motion freezes.
  return isViewportMoving && !isDraggingNode && !isDraggingWire;
}
