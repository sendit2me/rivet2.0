import { useState } from 'react';
import type { ChartNode, NodeId } from '@valerypopoff/rivet2-core';
import { DEFAULT_CANVAS_NODE_HEIGHT_ESTIMATE } from './canvasVisibilityBounds.js';

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useSelectionBox() {
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const startSelectionBox = (clientX: number, clientY: number) => {
    setSelectionBox({ x: clientX, y: clientY, width: 0, height: 0 });
  };

  const updateSelectionBox = (
    clientX: number,
    clientY: number,
    nodes: ChartNode[],
    clientToCanvasPosition: (x: number, y: number) => { x: number; y: number },
    selectedNodeIds: NodeId[],
  ): NodeId[] | null => {
    if (!selectionBox) {
      return null;
    }

    const newBox = {
      ...selectionBox,
      width: clientX - selectionBox.x,
      height: clientY - selectionBox.y,
    };
    setSelectionBox(newBox);

    const topLeft = {
      x: newBox.width < 0 ? newBox.x + newBox.width : newBox.x,
      y: newBox.height < 0 ? newBox.y + newBox.height : newBox.y,
    };
    const bottomRight = {
      x: newBox.width < 0 ? newBox.x : newBox.x + newBox.width,
      y: newBox.height < 0 ? newBox.y : newBox.y + newBox.height,
    };

    const canvasStartPoint = clientToCanvasPosition(topLeft.x, topLeft.y);
    const canvasEndPoint = clientToCanvasPosition(bottomRight.x, bottomRight.y);

    const nodesInBox = nodes.filter((node) => {
      const nodeWidth = node.visualData.width ?? 150;
      const nodeHeight = DEFAULT_CANVAS_NODE_HEIGHT_ESTIMATE;

      const nodeArea = nodeWidth * nodeHeight;
      const halfNodeArea = nodeArea / 2;

      // Calculate the area of intersection
      const xOverlap = Math.max(
        0,
        Math.min(canvasEndPoint.x, node.visualData.x + nodeWidth) - Math.max(canvasStartPoint.x, node.visualData.x),
      );
      const yOverlap = Math.max(
        0,
        Math.min(canvasEndPoint.y, node.visualData.y + nodeHeight) - Math.max(canvasStartPoint.y, node.visualData.y),
      );
      const overlapArea = xOverlap * yOverlap;

      // Check if at least 50% of the node is in the selection box
      return overlapArea > 0 && overlapArea >= halfNodeArea;
    });

    const isSameSetOfNodes =
      selectedNodeIds.length === nodesInBox.length &&
      selectedNodeIds.every((node) => nodesInBox.some((n) => n.id === node));

    if (!isSameSetOfNodes) {
      return nodesInBox.map((node) => node.id);
    }

    return null;
  };

  const endSelectionBox = () => {
    setSelectionBox(null);
  };

  return { selectionBox, startSelectionBox, updateSelectionBox, endSelectionBox };
}
