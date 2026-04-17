import { useLayoutEffect, useRef, useState } from 'react';
import type { ChartNode, NodeId } from '@ironclad/rivet-core';

export function useVisibleCanvasNodes(options: {
  nodes: ChartNode[];
  expandedOutputNodeIds: NodeId[];
  viewportBounds: { left: number; right: number; top: number; bottom: number };
}): {
  isNodeVisible: (node: ChartNode) => boolean;
} {
  const { nodes, expandedOutputNodeIds, viewportBounds } = options;
  const visibilityByNode = useRef(new WeakMap<ChartNode, boolean>());
  const [visibleVersion, setVisibleVersion] = useState(0);
  const movingRerenderTimeout = useRef<number | undefined>();
  const previousNodes = useRef<ChartNode[]>([]);

  const isLargeGraph = nodes.length > 100;
  const debounceTime = isLargeGraph ? 500 : 50;

  useLayoutEffect(() => {
    const recalculateVisibleNodes = () => {
      for (const node of nodes) {
        const isOutputExpanded = expandedOutputNodeIds.includes(node.id);
        const shouldHide =
          (node.visualData.x < viewportBounds.left - (node.visualData.width ?? 300) ||
            node.visualData.x > viewportBounds.right + (node.visualData.width ?? 300) ||
            node.visualData.y < viewportBounds.top - 500 ||
            node.visualData.y > viewportBounds.bottom + 500) &&
          !isOutputExpanded;

        visibilityByNode.current.set(node, !shouldHide);
      }

      setVisibleVersion((current) => current + 1);
    };

    if (movingRerenderTimeout.current) {
      window.clearTimeout(movingRerenderTimeout.current);
    }

    movingRerenderTimeout.current = window.setTimeout(recalculateVisibleNodes, debounceTime);

    if (previousNodes.current !== nodes) {
      previousNodes.current = nodes;
      recalculateVisibleNodes();
    }
  }, [
    debounceTime,
    expandedOutputNodeIds,
    nodes,
    viewportBounds.bottom,
    viewportBounds.left,
    viewportBounds.right,
    viewportBounds.top,
  ]);

  return {
    isNodeVisible: (node) => {
      visibleVersion;
      return visibilityByNode.current.get(node) !== false;
    },
  };
}
