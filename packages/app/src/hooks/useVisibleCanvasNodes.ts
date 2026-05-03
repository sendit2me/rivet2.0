import { useLayoutEffect, useMemo, useState } from 'react';
import type { ChartNode, NodeId } from '@valerypopoff/rivet2-core';
import {
  HEAVY_CONTENT_PADDING_X,
  HEAVY_CONTENT_PADDING_Y,
  MEDIUM_GRAPH_NODE_THRESHOLD,
  VISIBLE_PADDING_X,
  VISIBLE_PADDING_Y,
} from '../components/nodeCanvas/canvasPerformanceBudget.js';
import { markCanvasPerfEnd, markCanvasPerfStart, setCanvasPerf } from '../components/nodeCanvas/canvasPerfDebug.js';
import { getCanvasVisibilityBounds } from './canvasVisibilityBounds.js';

export interface CanvasNodeVisibilitySnapshot {
  heavyContentNodeIdSet: ReadonlySet<NodeId>;
  nearViewportNodeIdSet: ReadonlySet<NodeId>;
  visibleNodeIdSet: ReadonlySet<NodeId>;
}

export function calculateCanvasNodeVisibilitySnapshot(options: {
  draggingNodeIds: ReadonlyArray<NodeId>;
  editingNodeId: NodeId | null;
  expandedOutputNodeIds: ReadonlyArray<NodeId>;
  hoveringNodeId: NodeId | undefined;
  nodes: ChartNode[];
  selectedNodeIds: ReadonlyArray<NodeId>;
  viewportBounds: { left: number; right: number; top: number; bottom: number };
}): CanvasNodeVisibilitySnapshot {
  markCanvasPerfStart('useVisibleCanvasNodes:calculate');

  const {
    draggingNodeIds,
    editingNodeId,
    expandedOutputNodeIds,
    hoveringNodeId,
    nodes,
    selectedNodeIds,
    viewportBounds,
  } = options;

  const pinnedNodeIds = new Set<NodeId>([
    ...draggingNodeIds,
    ...expandedOutputNodeIds,
    ...selectedNodeIds,
  ]);
  const expandedOutputNodeIdSet = new Set(expandedOutputNodeIds);

  if (editingNodeId) {
    pinnedNodeIds.add(editingNodeId);
  }

  if (hoveringNodeId) {
    pinnedNodeIds.add(hoveringNodeId);
  }

  const visibleNodeIdSet = new Set<NodeId>();
  const nearViewportNodeIdSet = new Set<NodeId>();

  for (const node of nodes) {
    const { width, height } = getCanvasVisibilityBounds(node);
    const isOutputExpanded = expandedOutputNodeIdSet.has(node.id);

    const intersectsVisibleBounds =
      node.visualData.x >= viewportBounds.left - width - VISIBLE_PADDING_X &&
      node.visualData.x <= viewportBounds.right + width + VISIBLE_PADDING_X &&
      node.visualData.y >= viewportBounds.top - height - VISIBLE_PADDING_Y &&
      node.visualData.y <= viewportBounds.bottom + height + VISIBLE_PADDING_Y;

    if (intersectsVisibleBounds || isOutputExpanded) {
      visibleNodeIdSet.add(node.id);
    }

    const intersectsHeavyContentBounds =
      node.visualData.x >= viewportBounds.left - width - HEAVY_CONTENT_PADDING_X &&
      node.visualData.x <= viewportBounds.right + width + HEAVY_CONTENT_PADDING_X &&
      node.visualData.y >= viewportBounds.top - height - HEAVY_CONTENT_PADDING_Y &&
      node.visualData.y <= viewportBounds.bottom + height + HEAVY_CONTENT_PADDING_Y;

    if (intersectsHeavyContentBounds) {
      nearViewportNodeIdSet.add(node.id);
    }
  }

  const heavyContentNodeIdSet =
    nodes.length >= MEDIUM_GRAPH_NODE_THRESHOLD ? new Set(nearViewportNodeIdSet) : new Set(visibleNodeIdSet);

  for (const pinnedNodeId of pinnedNodeIds) {
    heavyContentNodeIdSet.add(pinnedNodeId);
  }

  setCanvasPerf('useVisibleCanvasNodes:visibleCount', visibleNodeIdSet.size);
  setCanvasPerf('useVisibleCanvasNodes:nearCount', nearViewportNodeIdSet.size);
  setCanvasPerf('useVisibleCanvasNodes:heavyCount', heavyContentNodeIdSet.size);
  markCanvasPerfEnd('useVisibleCanvasNodes:calculate');

  return {
    heavyContentNodeIdSet,
    nearViewportNodeIdSet,
    visibleNodeIdSet,
  };
}

function areNodeIdSetsEqual(previous: ReadonlySet<NodeId>, next: ReadonlySet<NodeId>): boolean {
  if (previous.size !== next.size) {
    return false;
  }

  for (const nodeId of previous) {
    if (!next.has(nodeId)) {
      return false;
    }
  }

  return true;
}

function areVisibilitySnapshotsEqual(previous: CanvasNodeVisibilitySnapshot, next: CanvasNodeVisibilitySnapshot): boolean {
  return (
    areNodeIdSetsEqual(previous.visibleNodeIdSet, next.visibleNodeIdSet) &&
    areNodeIdSetsEqual(previous.nearViewportNodeIdSet, next.nearViewportNodeIdSet) &&
    areNodeIdSetsEqual(previous.heavyContentNodeIdSet, next.heavyContentNodeIdSet)
  );
}

export function useVisibleCanvasNodes(options: {
  draggingNodeIds: ReadonlyArray<NodeId>;
  editingNodeId: NodeId | null;
  expandedOutputNodeIds: ReadonlyArray<NodeId>;
  hoveringNodeId: NodeId | undefined;
  isViewportMoving: boolean;
  nodes: ChartNode[];
  selectedNodeIds: ReadonlyArray<NodeId>;
  viewportBounds: { left: number; right: number; top: number; bottom: number };
}): {
  heavyContentNodeIdSet: ReadonlySet<NodeId>;
  isViewportVisibilitySettled: boolean;
  nearViewportNodeIdSet: ReadonlySet<NodeId>;
  visibleNodeIdSet: ReadonlySet<NodeId>;
} {
  const {
    draggingNodeIds,
    editingNodeId,
    expandedOutputNodeIds,
    hoveringNodeId,
    isViewportMoving,
    nodes,
    selectedNodeIds,
    viewportBounds,
  } = options;
  const visibilitySnapshotOptions = useMemo(
    () => ({
      draggingNodeIds,
      editingNodeId,
      expandedOutputNodeIds,
      hoveringNodeId,
      nodes,
      selectedNodeIds,
      viewportBounds,
    }),
    [draggingNodeIds, editingNodeId, expandedOutputNodeIds, hoveringNodeId, nodes, selectedNodeIds, viewportBounds],
  );

  const [settledSnapshot, setSettledSnapshot] = useState<CanvasNodeVisibilitySnapshot>(() =>
    calculateCanvasNodeVisibilitySnapshot(visibilitySnapshotOptions),
  );

  const currentSnapshot = useMemo(
    () =>
      isViewportMoving
        ? settledSnapshot
        : calculateCanvasNodeVisibilitySnapshot(visibilitySnapshotOptions),
    [isViewportMoving, settledSnapshot, visibilitySnapshotOptions],
  );

  useLayoutEffect(() => {
    if (isViewportMoving) {
      return;
    }

    setSettledSnapshot((previousSnapshot) =>
      areVisibilitySnapshotsEqual(previousSnapshot, currentSnapshot) ? previousSnapshot : currentSnapshot,
    );
  }, [currentSnapshot, isViewportMoving]);

  const activeSnapshot = isViewportMoving ? settledSnapshot : currentSnapshot;

  return {
    heavyContentNodeIdSet: activeSnapshot.heavyContentNodeIdSet,
    isViewportVisibilitySettled: !isViewportMoving,
    nearViewportNodeIdSet: activeSnapshot.nearViewportNodeIdSet,
    visibleNodeIdSet: activeSnapshot.visibleNodeIdSet,
  };
}
