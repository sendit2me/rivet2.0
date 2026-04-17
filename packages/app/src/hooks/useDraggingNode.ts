import { type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newId, type ChartNode, type NodeId } from '@ironclad/rivet-core';
import { useAtomValue, useSetAtom } from 'jotai';
import { canvasPositionState, selectedNodesState } from '../state/graphBuilder.js';
import { isNotNull } from '../utils/genericUtilFunctions.js';
import { nodesByIdState, nodesState } from '../state/graph.js';
import { useMoveNodeCommand } from '../commands/moveNodeCommand';
import { useDuplicateNodesCommand } from '../commands/duplicateNodesCommand.js';

export type DragMode = 'move' | 'duplicate';
export type DragActivatorModifierState = { altKey: boolean };
type DragModifierKeyEvent = Pick<KeyboardEvent, 'altKey' | 'key'>;
type DragStartPositionMap = Map<NodeId, { x: number; y: number }>;

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

export function getDraggingPreviewNodes(options: {
  dragMode: DragMode;
  sourceNodes: ChartNode[];
  previewNodes: ChartNode[];
}): ChartNode[] {
  return options.dragMode === 'duplicate' ? options.previewNodes : options.sourceNodes;
}

export function getDraggingConnectionSourceNodeIds(options: {
  dragMode: DragMode;
  sourceNodeIds: NodeId[];
}): NodeId[] {
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
  const [duplicatePreviewNodes, setDuplicatePreviewNodesState] = useState<ChartNode[]>([]);
  const [dragMode, setDragMode] = useState<DragMode>('move');
  const [isDragActive, setIsDragActive] = useState(false);

  const startPositionsRef = useRef<DragStartPositionMap>(new Map());
  const draggedSourceNodeIdsRef = useRef<NodeId[]>([]);
  const dragModeRef = useRef<DragMode>('move');
  const lastDragActivatorAltRef = useRef(false);

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

  const resetDragSession = useCallback(() => {
    lastDragActivatorAltRef.current = false;
    setSessionStartPositions(new Map());
    setSessionSourceNodeIds([]);
    setSessionSourceNodes([]);
    setSessionPreviewNodes([]);
    setSessionDragMode('move');
    setIsDragActive(false);
  }, [
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
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (shouldUseMoveDragModeOnKeyUp(event)) {
        setSessionDragMode('move');
      }
    };

    const handleBlur = () => {
      setSessionDragMode('move');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isDragActive, setSessionDragMode]);

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
      setSessionPreviewNodes(createDragDuplicatePreviewNodes(sourceNodes));
      setSessionStartPositions(createDragStartPositionMap(sourceNodes));
      setSessionDragMode(resolveDragModeFromAlt(lastDragActivatorAltRef.current));
      setIsDragActive(true);
    },
    [
      nodesById,
      resetDragSession,
      selectedNodeIds,
      setSessionDragMode,
      setSessionPreviewNodes,
      setSessionSourceNodeIds,
      setSessionSourceNodes,
      setSessionStartPositions,
    ],
  );

  const onNodeDragged = useCallback(
    ({ delta }: DragEndEvent) => {
      const actualDelta = {
        x: delta.x / canvasPosition.zoom,
        y: delta.y / canvasPosition.zoom,
      };

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
    [
      canvasPosition.zoom,
      duplicateNodes,
      moveNode,
      resetDragSession,
      setNodes,
    ],
  );

  const onNodeDragCancelled = useCallback(() => {
    resetDragSession();
  }, [resetDragSession]);

  return {
    dragMode,
    draggingConnectionSourceNodeIds,
    draggingNodes,
    onNodeDragActivatorPointerDown,
    onNodeDragCancelled,
    onNodeStartDrag,
    onNodeDragged,
  };
};
