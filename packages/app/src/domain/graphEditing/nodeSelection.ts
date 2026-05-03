import type { NodeId } from '@valerypopoff/rivet2-core';

export function toggleNodeSelection(selectedNodeIds: readonly NodeId[], nodeId: NodeId): NodeId[] {
  if (selectedNodeIds.includes(nodeId)) {
    return selectedNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId);
  }

  return [...new Set([...selectedNodeIds, nodeId])];
}
