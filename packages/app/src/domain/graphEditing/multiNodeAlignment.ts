import type { NodeId } from '@rivet2/rivet-core';

export type MultiNodeAlignmentAction =
  | 'align-left'
  | 'align-right'
  | 'align-top'
  | 'align-bottom'
  | 'align-center'
  | 'align-middle'
  | 'distribute-horizontally'
  | 'distribute-vertically';

export type NodeLayoutBounds = {
  nodeId: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NodeLayoutMove = {
  nodeId: NodeId;
  position: {
    x: number;
    y: number;
  };
};

function getSelectionBounds(nodeBounds: readonly NodeLayoutBounds[]) {
  return nodeBounds.reduce(
    (bounds, node) => ({
      left: Math.min(bounds.left, node.x),
      right: Math.max(bounds.right, node.x + node.width),
      top: Math.min(bounds.top, node.y),
      bottom: Math.max(bounds.bottom, node.y + node.height),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
}

function distributeHorizontally(nodeBounds: readonly NodeLayoutBounds[]): NodeLayoutMove[] {
  if (nodeBounds.length <= 1) {
    return nodeBounds.map((node) => ({
      nodeId: node.nodeId,
      position: { x: node.x, y: node.y },
    }));
  }

  const sorted = [...nodeBounds].sort((a, b) => a.x - b.x || a.y - b.y);
  const { left, right } = getSelectionBounds(nodeBounds);
  const totalWidth = sorted.reduce((sum, node) => sum + node.width, 0);
  const gap = (right - left - totalWidth) / (sorted.length - 1);

  const nextPositions = new Map<NodeId, { x: number; y: number }>();
  let cursorX = left;

  for (const node of sorted) {
    nextPositions.set(node.nodeId, { x: cursorX, y: node.y });
    cursorX += node.width + gap;
  }

  return nodeBounds.map((node) => ({
    nodeId: node.nodeId,
    position: nextPositions.get(node.nodeId)!,
  }));
}

function distributeVertically(nodeBounds: readonly NodeLayoutBounds[]): NodeLayoutMove[] {
  if (nodeBounds.length <= 1) {
    return nodeBounds.map((node) => ({
      nodeId: node.nodeId,
      position: { x: node.x, y: node.y },
    }));
  }

  const sorted = [...nodeBounds].sort((a, b) => a.y - b.y || a.x - b.x);
  const { top, bottom } = getSelectionBounds(nodeBounds);
  const totalHeight = sorted.reduce((sum, node) => sum + node.height, 0);
  const gap = (bottom - top - totalHeight) / (sorted.length - 1);

  const nextPositions = new Map<NodeId, { x: number; y: number }>();
  let cursorY = top;

  for (const node of sorted) {
    nextPositions.set(node.nodeId, { x: node.x, y: cursorY });
    cursorY += node.height + gap;
  }

  return nodeBounds.map((node) => ({
    nodeId: node.nodeId,
    position: nextPositions.get(node.nodeId)!,
  }));
}

export function calculateMultiNodeAlignmentMoves(
  nodeBounds: readonly NodeLayoutBounds[],
  action: MultiNodeAlignmentAction,
): NodeLayoutMove[] {
  if (nodeBounds.length === 0) {
    return [];
  }

  const selectionBounds = getSelectionBounds(nodeBounds);
  const centerX = (selectionBounds.left + selectionBounds.right) / 2;
  const centerY = (selectionBounds.top + selectionBounds.bottom) / 2;

  switch (action) {
    case 'align-left':
      return nodeBounds.map((node) => ({
        nodeId: node.nodeId,
        position: { x: selectionBounds.left, y: node.y },
      }));
    case 'align-right':
      return nodeBounds.map((node) => ({
        nodeId: node.nodeId,
        position: { x: selectionBounds.right - node.width, y: node.y },
      }));
    case 'align-top':
      return nodeBounds.map((node) => ({
        nodeId: node.nodeId,
        position: { x: node.x, y: selectionBounds.top },
      }));
    case 'align-bottom':
      return nodeBounds.map((node) => ({
        nodeId: node.nodeId,
        position: { x: node.x, y: selectionBounds.bottom - node.height },
      }));
    case 'align-center':
      return nodeBounds.map((node) => ({
        nodeId: node.nodeId,
        position: { x: centerX - node.width / 2, y: node.y },
      }));
    case 'align-middle':
      return nodeBounds.map((node) => ({
        nodeId: node.nodeId,
        position: { x: node.x, y: centerY - node.height / 2 },
      }));
    case 'distribute-horizontally':
      return distributeHorizontally(nodeBounds);
    case 'distribute-vertically':
      return distributeVertically(nodeBounds);
  }
}
