import { type DragStartEvent, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newId, type ChartNode, type NodeId } from '@rivet2/rivet-core';
import { useAtomValue, useSetAtom } from 'jotai';
import { canvasPositionState, selectedNodesState } from '../state/graphBuilder.js';
import { isNotNull } from '../utils/genericUtilFunctions.js';
import { nodesByIdState, nodesState } from '../state/graph.js';
import { useMoveNodeCommand } from '../commands/moveNodeCommand';
import { useDuplicateNodesCommand } from '../commands/duplicateNodesCommand.js';

export type DragMode = 'move' | 'duplicate';
export type DragAxisLock = 'x' | 'y' | undefined;
export type DragActivatorModifierState = {
  altKey: boolean;
  hoverControlsVisible: boolean;
  nodeId: NodeId;
  shiftKey: boolean;
};
type DragModifierKeyEvent = Pick<KeyboardEvent, 'altKey' | 'key'>;
type DragShiftKeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey'>;
type DragStartPositionMap = Map<NodeId, { x: number; y: number }>;
type DragDelta = { x: number; y: number };

export function resolveDraggedNodeIds(selectedNodeIds: NodeId[], draggedNodeId: NodeId): NodeId[] {
  return selectedNodeIds.length > 0 ? [...new Set([...selectedNodeIds, draggedNodeId])] : [draggedNodeId];
}

export function resolveDraggedSourceNodes(
  draggedNodeIds: NodeId[],
  nodesById: Record<NodeId, ChartNode | undefined>,
): { sourceNodeIds: NodeId[]; sourceNodes: ChartNode[] } {
  const sourceNodes = draggedNodeIds.map((nodeId) => nodesById[nodeId]).filter(isNotNull);

  return {
    sourceNodeIds: sourceNodes.map((node) => node.id),
    sourceNodes,
  };
}

export function resolveDragModeFromAlt(altKey: boolean): DragMode {
  return altKey ? 'duplicate' : 'move';
}

export function resolveDragAxisLock({
  axisLock,
  shiftKey,
  delta,
}: {
  axisLock: DragAxisLock;
  shiftKey: boolean;
  delta: DragDelta;
}): DragAxisLock {
  if (!shiftKey) {
    return undefined;
  }

  if (axisLock) {
    return axisLock;
  }

  if (delta.x === 0 && delta.y === 0) {
    return undefined;
  }

  return Math.abs(delta.x) >= Math.abs(delta.y) ? 'x' : 'y';
}

export function constrainDragDeltaToAxisLock<T extends DragDelta>(delta: T, axisLock: DragAxisLock): T {
  if (axisLock === 'x') {
    return { ...delta, y: 0 };
  }

  if (axisLock === 'y') {
    return { ...delta, x: 0 };
  }

  return delta;
}

export function createDragDuplicatePreviewNodes(nodes: ChartNode[]): ChartNode[] {
  return nodes.map((node) => ({
    ...node,
    id: newId<NodeId>(),
    visualData: {
      ...node.visualData,
    },
  }));
}

export function shouldUseDuplicateDragModeOnKeyDown(event: DragModifierKeyEvent): boolean {
  return event.key === 'Alt' || event.altKey;
}

export function shouldUseMoveDragModeOnKeyUp(event: DragModifierKeyEvent): boolean {
  return event.key === 'Alt' || !event.altKey;
}

export function shouldEnableStraightLineDragOnKeyDown(event: DragShiftKeyEvent): boolean {
  return event.key === 'Shift' || event.shiftKey;
}

export function shouldDisableStraightLineDragOnKeyUp(event: DragShiftKeyEvent): boolean {
  return event.key === 'Shift' || !event.shiftKey;
}

export function getDraggingPreviewNodes(options: {
  dragMode: DragMode;
  sourceNodes: ChartNode[];
  previewNodes: ChartNode[];
}): ChartNode[] {
  return options.dragMode === 'duplicate' ? options.previewNodes : options.sourceNodes;
}

export function getDraggingConnectionSourceNodeIds(options: { dragMode: DragMode; sourceNodeIds: NodeId[] }): NodeId[] {
  return options.dragMode === 'move' ? options.sourceNodeIds : [];
}

function createDragStartPositionMap(nodes: ChartNode[]): DragStartPositionMap {
  return new Map(
    nodes.map((node) => [
      node.id,
      {
        x: node.visualData.x,
        y: node.visualData.y,
      },
    ]),
  );
}

function bringNodesToFront(nodes: ChartNode[], nodeIdsToFront: NodeId[]): ChartNode[] {
  if (nodeIdsToFront.length === 0) {
    return nodes;
  }

  const nodeIdSet = new Set(nodeIdsToFront);
  const maxZIndex = nodes.reduce(
    (max, node) =>
      Math.max(max, node.visualData.zIndex && !Number.isNaN(node.visualData.zIndex) ? node.visualData.zIndex : 0),
    0,
  );

  return nodes.map((node) =>
    nodeIdSet.has(node.id) ? { ...node, visualData: { ...node.visualData, zIndex: maxZIndex + 1 } } : node,
  );
}

export const useDraggingNode = () => {
  const selectedNodeIds = useAtomValue(selectedNodesState);
  const canvasPosition = useAtomValue(canvasPositionState);
  const nodesById = useAtomValue(nodesByIdState);
  const setNodes = useSetAtom(nodesState);

  const [draggedSourceNodes, setDraggedSourceNodesState] = useState<ChartNode[]>([]);
  const [draggedHoverControlSourceNodeIds, setDraggedHoverControlSourceNodeIds] = useState<NodeId[]>([]);
  const [duplicatePreviewNodes, setDuplicatePreviewNodesState] = useState<ChartNode[]>([]);
  const [dragMode, setDragMode] = useState<DragMode>('move');
  const [dragAxisLock, setDragAxisLock] = useState<DragAxisLock>();
  const [isDragActive, setIsDragActive] = useState(false);

  const startPositionsRef = useRef<DragStartPositionMap>(new Map());
  const draggedSourceNodeIdsRef = useRef<NodeId[]>([]);
  const dragModeRef = useRef<DragMode>('move');
  const dragAxisLockRef = useRef<DragAxisLock>();
  const isShiftDragConstraintEnabledRef = useRef(false);
  const lastDragDeltaRef = useRef<DragDelta>({ x: 0, y: 0 });
  const lastDragActivatorAltRef = useRef(false);
  const lastDragActivatorHoverControlsVisibleRef = useRef(false);
  const lastDragActivatorNodeIdRef = useRef<NodeId | undefined>();
  const lastDragActivatorShiftRef = useRef(false);

  const moveNode = useMoveNodeCommand();
  const duplicateNodes = useDuplicateNodesCommand();

  const setSessionStartPositions = useCallback((positions: DragStartPositionMap) => {
    startPositionsRef.current = positions;
  }, []);

  const setSessionSourceNodeIds = useCallback((nodeIds: NodeId[]) => {
    draggedSourceNodeIdsRef.current = nodeIds;
  }, []);

  const setSessionSourceNodes = useCallback((sourceNodes: ChartNode[]) => {
    setDraggedSourceNodesState(sourceNodes);
  }, []);

  const setSessionPreviewNodes = useCallback((previewNodes: ChartNode[]) => {
    setDuplicatePreviewNodesState(previewNodes);
  }, []);

  const setSessionDragMode = useCallback((nextDragMode: DragMode) => {
    dragModeRef.current = nextDragMode;
    setDragMode(nextDragMode);
  }, []);

  const setSessionDragAxisLock = useCallback((nextDragAxisLock: DragAxisLock) => {
    dragAxisLockRef.current = nextDragAxisLock;
    setDragAxisLock(nextDragAxisLock);
  }, []);

  const resetDragSession = useCallback(() => {
    lastDragActivatorAltRef.current = false;
    lastDragActivatorHoverControlsVisibleRef.current = false;
    lastDragActivatorNodeIdRef.current = undefined;
    lastDragActivatorShiftRef.current = false;
    isShiftDragConstraintEnabledRef.current = false;
    lastDragDeltaRef.current = { x: 0, y: 0 };
    setSessionStartPositions(new Map());
    setSessionSourceNodeIds([]);
    setSessionSourceNodes([]);
    setDraggedHoverControlSourceNodeIds([]);
    setSessionPreviewNodes([]);
    setSessionDragMode('move');
    setSessionDragAxisLock(undefined);
    setIsDragActive(false);
  }, [
    setSessionDragAxisLock,
    setSessionDragMode,
    setSessionPreviewNodes,
    setSessionSourceNodeIds,
    setSessionSourceNodes,
    setSessionStartPositions,
  ]);

  useEffect(() => {
    if (!isDragActive) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldUseDuplicateDragModeOnKeyDown(event)) {
        setSessionDragMode('duplicate');
      }

      if (shouldEnableStraightLineDragOnKeyDown(event)) {
        isShiftDragConstraintEnabledRef.current = true;
        setSessionDragAxisLock(
          resolveDragAxisLock({
            axisLock: dragAxisLockRef.current,
            shiftKey: true,
            delta: lastDragDeltaRef.current,
          }),
        );
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (shouldUseMoveDragModeOnKeyUp(event)) {
        setSessionDragMode('move');
      }

      if (shouldDisableStraightLineDragOnKeyUp(event)) {
        isShiftDragConstraintEnabledRef.current = false;
        setSessionDragAxisLock(undefined);
      }
    };

    const handleBlur = () => {
      setSessionDragMode('move');
      isShiftDragConstraintEnabledRef.current = false;
      setSessionDragAxisLock(undefined);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isDragActive, setSessionDragAxisLock, setSessionDragMode]);

  const draggingNodes = useMemo(
    () =>
      getDraggingPreviewNodes({
        dragMode,
        sourceNodes: draggedSourceNodes,
        previewNodes: duplicatePreviewNodes,
      }),
    [dragMode, draggedSourceNodes, duplicatePreviewNodes],
  );

  const draggedSourceNodeIds = useMemo(() => draggedSourceNodes.map((node) => node.id), [draggedSourceNodes]);

  const draggingConnectionSourceNodeIds = useMemo(
    () =>
      getDraggingConnectionSourceNodeIds({
        dragMode,
        sourceNodeIds: draggedSourceNodeIds,
      }),
    [dragMode, draggedSourceNodeIds],
  );

  const onNodeDragActivatorPointerDown = useCallback((modifierState: DragActivatorModifierState) => {
    lastDragActivatorAltRef.current = modifierState.altKey;
    lastDragActivatorHoverControlsVisibleRef.current = modifierState.hoverControlsVisible;
    lastDragActivatorNodeIdRef.current = modifierState.nodeId;
    lastDragActivatorShiftRef.current = modifierState.shiftKey;
  }, []);

  const onNodeStartDrag = useCallback(
    (e: DragStartEvent) => {
      const draggedNodeId = e.active.id as NodeId;
      const draggedNodeIds = resolveDraggedNodeIds(selectedNodeIds, draggedNodeId);
      const { sourceNodeIds, sourceNodes } = resolveDraggedSourceNodes(draggedNodeIds, nodesById);
      if (sourceNodes.length === 0) {
        resetDragSession();
        return;
      }

      setSessionSourceNodeIds(sourceNodeIds);
      setSessionSourceNodes(sourceNodes);
      setDraggedHoverControlSourceNodeIds(
        lastDragActivatorHoverControlsVisibleRef.current &&
          lastDragActivatorNodeIdRef.current &&
          sourceNodeIds.includes(lastDragActivatorNodeIdRef.current)
          ? [lastDragActivatorNodeIdRef.current]
          : [],
      );
      setSessionPreviewNodes(createDragDuplicatePreviewNodes(sourceNodes));
      setSessionStartPositions(createDragStartPositionMap(sourceNodes));
      isShiftDragConstraintEnabledRef.current = lastDragActivatorShiftRef.current;
      lastDragDeltaRef.current = { x: 0, y: 0 };
      setSessionDragAxisLock(undefined);
      setSessionDragMode(resolveDragModeFromAlt(lastDragActivatorAltRef.current));
      setIsDragActive(true);
    },
    [
      nodesById,
      resetDragSession,
      selectedNodeIds,
      setSessionDragAxisLock,
      setSessionDragMode,
      setSessionPreviewNodes,
      setSessionSourceNodeIds,
      setSessionSourceNodes,
      setSessionStartPositions,
    ],
  );

  const onNodeDraggedMove = useCallback(
    ({ delta }: DragMoveEvent) => {
      const nextDelta = {
        x: delta.x,
        y: delta.y,
      };

      lastDragDeltaRef.current = nextDelta;
      setSessionDragAxisLock(
        resolveDragAxisLock({
          axisLock: dragAxisLockRef.current,
          shiftKey: isShiftDragConstraintEnabledRef.current,
          delta: nextDelta,
        }),
      );
    },
    [setSessionDragAxisLock],
  );

  const onNodeDragged = useCallback(
    ({ delta }: DragEndEvent) => {
      const actualDelta = constrainDragDeltaToAxisLock(
        {
          x: delta.x / canvasPosition.zoom,
          y: delta.y / canvasPosition.zoom,
        },
        dragAxisLockRef.current,
      );

      const finalDragMode = dragModeRef.current;
      const sourceNodeIds = draggedSourceNodeIdsRef.current;
      const initialPositions = startPositionsRef.current;

      try {
        if (finalDragMode === 'duplicate') {
          if (sourceNodeIds.length === 0) {
            return;
          }

          duplicateNodes({
            nodeIds: sourceNodeIds,
            delta: actualDelta,
          });

          return;
        }

        if (sourceNodeIds.length === 0) {
          return;
        }

        moveNode({
          moves: sourceNodeIds.map((nodeId) => {
            const initialPosition = initialPositions.get(nodeId);
            if (!initialPosition) {
              throw new Error(`Initial position not found for nodeId ${nodeId}`);
            }

            return {
              nodeId,
              position: {
                x: initialPosition.x + actualDelta.x,
                y: initialPosition.y + actualDelta.y,
              },
            };
          }),
        });
        setNodes((currentNodes) => bringNodesToFront(currentNodes, sourceNodeIds));
      } finally {
        resetDragSession();
      }
    },
    [canvasPosition.zoom, duplicateNodes, moveNode, resetDragSession, setNodes],
  );

  const onNodeDragCancelled = useCallback(() => {
    resetDragSession();
  }, [resetDragSession]);

  return {
    dragAxisLock,
    dragMode,
    draggingConnectionSourceNodeIds,
    draggingNodes,
    draggedSourceNodeIds,
    draggedHoverControlSourceNodeIds,
    onNodeDragActivatorPointerDown,
    onNodeDragCancelled,
    onNodeDraggedMove,
    onNodeStartDrag,
    onNodeDragged,
  };
};
