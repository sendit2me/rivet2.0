import { useThrottleFn } from 'ahooks';
import { useEffect, useRef, useState } from 'react';
import type { ChartNode, GraphId, NodeId } from '@rivet2/rivet-core';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import type { CanvasPosition } from '../../state/graphBuilder.js';
import { VIEWPORT_SETTLE_MS } from './canvasPerformanceBudget.js';

const SHIFT_WHEEL_ZOOM_MULTIPLIER = 6;
const MAX_WHEEL_ZOOM_SPEED = 0.95;

export function getWheelZoomFactor({
  wheelDelta,
  zoomSensitivity,
  shiftKey,
}: {
  wheelDelta: number;
  zoomSensitivity: number;
  shiftKey: boolean;
}): number {
  const zoomSpeed = Math.min(
    (zoomSensitivity / 10) * (shiftKey ? SHIFT_WHEEL_ZOOM_MULTIPLIER : 1),
    MAX_WHEEL_ZOOM_SPEED,
  );

  return wheelDelta < 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
}

export interface UseNodeCanvasInteractionsOptions {
  canvasPosition: CanvasPosition;
  clientToCanvasPosition: (x: number, y: number) => { x: number; y: number };
  dragStart: { x: number; y: number; canvasStartX: number; canvasStartY: number };
  endSelectionBox: () => void;
  isDraggingCanvas: boolean;
  nodes: ChartNode[];
  onCanvasContextMenu: (event: { clientX: number; clientY: number; target: EventTarget }) => void;
  selectedGraphId: GraphId | undefined;
  selectedNodeIds: NodeId[];
  selectionBox: { x: number; y: number; width: number; height: number } | null;
  setCanvasPosition: (position: CanvasPosition) => void;
  setDragStart: (value: { x: number; y: number; canvasStartX: number; canvasStartY: number }) => void;
  setEditingNodeId: (id: NodeId | null) => void;
  setIsDraggingCanvas: (value: boolean) => void;
  setLastMousePosition: (position: { x: number; y: number }) => void;
  setLastSavedCanvasPosition: (
    updater: (saved: Record<GraphId, CanvasPosition | undefined>) => Record<GraphId, CanvasPosition | undefined>,
  ) => void;
  setSelectedNodeIds: (ids: NodeId[]) => void;
  startSelectionBox: (x: number, y: number) => void;
  updateSelectionBox: (
    x: number,
    y: number,
    nodes: ChartNode[],
    clientToCanvasPosition: (x: number, y: number) => { x: number; y: number },
    selectedNodeIds: NodeId[],
  ) => NodeId[] | null;
  zoomSensitivity: number;
}

export const useNodeCanvasInteractions = ({
  canvasPosition,
  clientToCanvasPosition,
  dragStart,
  endSelectionBox,
  isDraggingCanvas,
  nodes,
  onCanvasContextMenu,
  selectedGraphId,
  selectedNodeIds,
  selectionBox,
  setCanvasPosition,
  setDragStart,
  setEditingNodeId,
  setIsDraggingCanvas,
  setLastMousePosition,
  setLastSavedCanvasPosition,
  setSelectedNodeIds,
  startSelectionBox,
  updateSelectionBox,
  zoomSensitivity,
}: UseNodeCanvasInteractionsOptions) => {
  const lastMouseInfoRef = useRef<{ x: number; y: number; target: EventTarget | undefined }>({
    x: -3000,
    y: 0,
    target: undefined,
  });
  const persistCanvasPositionTimeoutRef = useRef<number | undefined>();
  const viewportMotionTimeoutRef = useRef<number | undefined>();
  const lastViewportMotionAtRef = useRef(0);
  const isViewportMovingRef = useRef(false);
  const [isViewportMoving, setIsViewportMoving] = useState(false);

  const isScrollable = (element: HTMLElement): boolean => {
    const style = window.getComputedStyle(element);
    const isVerticalScrollable = element.scrollHeight > element.clientHeight && style.overflowY === 'auto';
    const isHorizontalScrollable = element.scrollWidth > element.clientWidth && style.overflowX === 'auto';

    return isVerticalScrollable || isHorizontalScrollable;
  };

  const isAnyParentScrollable = (element: HTMLElement): boolean => {
    let currentNode = element.parentElement;

    while (currentNode) {
      if (isScrollable(currentNode)) {
        return true;
      }
      currentNode = currentNode.parentElement;
    }

    return false;
  };

  const canvasMouseDown = useStableCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !(e.target as HTMLElement).classList.contains('node-canvas')) {
      return;
    }

    e.preventDefault();

    if (e.shiftKey) {
      startSelectionBox(e.clientX, e.clientY);
      return;
    }

    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX, y: e.clientY, canvasStartX: canvasPosition.x, canvasStartY: canvasPosition.y });
    reportViewportMotion();
  });

  const persistCanvasPosition = useStableCallback((position: CanvasPosition) => {
    if (!selectedGraphId) {
      return;
    }

    setLastSavedCanvasPosition((saved) => ({ ...saved, [selectedGraphId]: position }));
  });

  const schedulePersistCanvasPosition = useStableCallback((position: CanvasPosition) => {
    if (persistCanvasPositionTimeoutRef.current) {
      window.clearTimeout(persistCanvasPositionTimeoutRef.current);
    }

    persistCanvasPositionTimeoutRef.current = window.setTimeout(() => {
      persistCanvasPosition(position);
      persistCanvasPositionTimeoutRef.current = undefined;
    }, 150);
  });

  const reportViewportMotion = useStableCallback(() => {
    lastViewportMotionAtRef.current = Date.now();

    if (!isViewportMovingRef.current) {
      isViewportMovingRef.current = true;
      setIsViewportMoving(true);
    }

    if (viewportMotionTimeoutRef.current) {
      window.clearTimeout(viewportMotionTimeoutRef.current);
    }

    viewportMotionTimeoutRef.current = window.setTimeout(() => {
      isViewportMovingRef.current = false;
      setIsViewportMoving(false);
      viewportMotionTimeoutRef.current = undefined;
    }, VIEWPORT_SETTLE_MS);
  });

  const getCanvasDragPosition = useStableCallback((clientX: number, clientY: number): CanvasPosition => {
    const dx = (clientX - dragStart.x) * (1 / canvasPosition.zoom);
    const dy = (clientY - dragStart.y) * (1 / canvasPosition.zoom);

    return {
      x: dragStart.canvasStartX + dx,
      y: dragStart.canvasStartY + dy,
      zoom: canvasPosition.zoom,
    };
  });

  const canvasMouseMove = useThrottleFn(
    (e: React.MouseEvent) => {
      setLastMousePosition({ x: e.clientX, y: e.clientY });
      lastMouseInfoRef.current = { x: e.clientX, y: e.clientY, target: e.target };

      if (selectionBox) {
        const newSelectedNodeIds = updateSelectionBox(e.clientX, e.clientY, nodes, clientToCanvasPosition, selectedNodeIds);
        if (newSelectedNodeIds) {
          setSelectedNodeIds(newSelectedNodeIds);
        }
        return;
      }

      if (!isDraggingCanvas) {
        return;
      }

      const position = getCanvasDragPosition(e.clientX, e.clientY);
      setCanvasPosition(position);
      reportViewportMotion();
    },
    { wait: 10 },
  );

  const zoomDebounced = useThrottleFn(
    (target: HTMLElement, wheelDelta: number, clientX: number, clientY: number, shiftKey: boolean) => {
      if (isAnyParentScrollable(target)) {
        return;
      }

      const zoomFactor = getWheelZoomFactor({ wheelDelta, zoomSensitivity, shiftKey });
      const newZoom = canvasPosition.zoom * zoomFactor;
      const currentMousePosCanvas = clientToCanvasPosition(clientX, clientY);
      const newX = clientX / newZoom - canvasPosition.x;
      const newY = clientY / newZoom - canvasPosition.y;
      const diff = {
        x: newX - currentMousePosCanvas.x,
        y: newY - currentMousePosCanvas.y,
      };
      const position: CanvasPosition = {
        x: canvasPosition.x + diff.x,
        y: canvasPosition.y + diff.y,
        zoom: newZoom,
      };

      setCanvasPosition(position);
      reportViewportMotion();
      schedulePersistCanvasPosition(position);
    },
    { wait: 25 },
  );

  const handleZoom = useStableCallback((event: React.WheelEvent<HTMLDivElement>) => {
    zoomDebounced.run(event.target as HTMLElement, event.deltaY, event.clientX, event.clientY, event.shiftKey);
  });

  const canvasMouseUp = useStableCallback((e: React.MouseEvent) => {
    const wasDraggingCanvas = isDraggingCanvas;

    if (selectionBox) {
      endSelectionBox();
    } else if (!isDraggingCanvas) {
      return;
    }

    if (wasDraggingCanvas) {
      if (persistCanvasPositionTimeoutRef.current) {
        window.clearTimeout(persistCanvasPositionTimeoutRef.current);
        persistCanvasPositionTimeoutRef.current = undefined;
      }

      const finalPosition = getCanvasDragPosition(e.clientX, e.clientY);
      setCanvasPosition(finalPosition);
      persistCanvasPosition(finalPosition);
      setIsDraggingCanvas(false);
      reportViewportMotion();
    }

    const clientDelta = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };
    const distance = Math.sqrt(clientDelta.x * clientDelta.x + clientDelta.y * clientDelta.y);
    if (distance < 5) {
      setEditingNodeId(null);
      setSelectedNodeIds([]);
    }
  });

  const handleCanvasContextMenu = useStableCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onCanvasContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      target: e.target,
    });
  });

  useEffect(
    () => () => {
      if (persistCanvasPositionTimeoutRef.current) {
        window.clearTimeout(persistCanvasPositionTimeoutRef.current);
      }

      if (viewportMotionTimeoutRef.current) {
        window.clearTimeout(viewportMotionTimeoutRef.current);
      }
    },
    [],
  );

  return {
    canvasMouseDown,
    canvasMouseMove,
    canvasMouseUp,
    handleCanvasContextMenu,
    handleZoom,
    isViewportMoving,
    lastMouseInfoRef,
    lastViewportMotionAt: lastViewportMotionAtRef.current,
    reportViewportMotion,
  };
};
