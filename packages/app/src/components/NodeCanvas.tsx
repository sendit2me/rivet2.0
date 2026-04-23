import { DndContext, useDroppable } from '@dnd-kit/core';
import { useMergeRefs } from '@floating-ui/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { produce } from 'immer';
import {
  type FC,
  type MouseEvent,
  type MutableRefObject,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type ChartNode,
  type CommentNode,
  type NodeConnection,
  type NodeId,
} from '@ironclad/rivet-core';
import { useAutoLayoutCommand } from '../commands/autoLayoutCommand';
import { useDeleteNodesCommand } from '../commands/deleteNodeCommand';
import { useEditNodeCommand } from '../commands/editNodeCommand';
import { useCanvasHotkeys } from '../hooks/useCanvasHotkeys';
import { useCanvasPositioning } from '../hooks/useCanvasPositioning.js';
import { useContextMenu } from '../hooks/useContextMenu.js';
import { useCopyNodesHotkeys } from '../hooks/useCopyNodesHotkeys';
import { useDraggingNode } from '../hooks/useDraggingNode.js';
import { useDraggingWire } from '../hooks/useDraggingWire.js';
import { useGlobalHotkey } from '../hooks/useGlobalHotkey.js';
import { useNodeHeightCache } from '../hooks/useNodeBodyHeight';
import { useNodePortPositions } from '../hooks/useNodePortPositions';
import { useNodeTypes } from '../hooks/useNodeTypes';
import { usePortHoverTooltip } from '../hooks/usePortHoverTooltip.js';
import { useSearchGraph } from '../hooks/useSearchGraph';
import { useSelectionBox } from '../hooks/useSelectionBox.js';
import { useStableCallback } from '../hooks/useStableCallback.js';
import { useViewportBounds } from '../hooks/useViewportBounds.js';
import { useVisibleCanvasNodes } from '../hooks/useVisibleCanvasNodes';
import { useWireDragScrolling } from '../hooks/useWireDragScrolling';
import {
  canvasPositionState,
  editingNodeState,
  lastCanvasPositionByGraphState,
  lastMousePositionState,
  selectedNodesState,
  searchMatchingNodeIdsState,
  draggingWireClosestPortState,
  hoveringNodeState,
  expandedOutputNodeIdsState,
} from '../state/graphBuilder';
import { graphMetadataState } from '../state/graph.js';
import { lastRunDataByNodeState, selectedProcessPageNodesState } from '../state/dataFlow';
import { zoomSensitivityState } from '../state/settings';
import { canvasPreviewConnectionsState } from '../state/selectors/canvasGraphSelectors.js';
import { MouseIcon } from './MouseIcon';
import { type ContextMenuContext } from './ContextMenu.js';
import { nodeCanvasStyles } from './nodeCanvas/nodeCanvasStyles.js';
import { NodeCanvasOverlays } from './nodeCanvas/NodeCanvasOverlays.js';
import { MultiNodeAlignmentToolbar } from './nodeCanvas/MultiNodeAlignmentToolbar.js';
import { NodeCanvasViewport } from './nodeCanvas/NodeCanvasViewport.js';
import { useNodeCanvasInteractions } from './nodeCanvas/useNodeCanvasInteractions.js';
import type { NodeResizeBounds } from '../utils/nodeResize.js';
import { MEDIUM_GRAPH_NODE_THRESHOLD } from './nodeCanvas/canvasPerformanceBudget.js';
import { getCanvasPerfSnapshot } from './nodeCanvas/canvasPerfDebug.js';
import { groupConnectionsByNode } from './nodeCanvas/groupConnectionsByNode.js';

const EMPTY_NODE_CONNECTIONS: NodeConnection[] = [];

export interface NodeCanvasProps {
  nodes: ChartNode[];
  connections: NodeConnection[];
  selectedNodes: ChartNode[];
  onNodesChanged: (nodes: ChartNode[]) => void;
  onConnectionsChanged: (connections: NodeConnection[]) => void;
  onNodeSelected: (node: ChartNode, multi: boolean) => void;
  onNodeStartEditing?: (node: ChartNode) => void;
  onContextMenuItemSelected?: (
    menuItemId: string,
    data: unknown,
    context: ContextMenuContext,
    meta: { x: number; y: number },
  ) => void;
  autoLayoutGraph: MutableRefObject<() => void>;
}

export type PortPositions = Record<string, { x: number; y: number }>;

export const NodeCanvas: FC<NodeCanvasProps> = ({
  nodes,
  connections: _connections,
  selectedNodes,
  onNodesChanged,
  onConnectionsChanged,
  onNodeSelected,
  onNodeStartEditing,
  onContextMenuItemSelected,
  autoLayoutGraph,
}) => {
  const [canvasPosition, setCanvasPosition] = useAtom(canvasPositionState);
  const [editingNodeId, setEditingNodeId] = useAtom(editingNodeState);
  const [selectedNodeIds, setSelectedNodeIds] = useAtom(selectedNodesState);
  const [hoveringNode, setHoveringNode] = useAtom(hoveringNodeState);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, canvasStartX: 0, canvasStartY: 0 });
  const [contextMenuDisabled, setContextMenuDisabled] = useState(true);

  const selectedGraphMetadata = useAtomValue(graphMetadataState);
  const closestPort = useAtomValue(draggingWireClosestPortState);
  const searchMatchingNodes = useAtomValue(searchMatchingNodeIdsState);
  const expandedOutputNodeIds = useAtomValue(expandedOutputNodeIdsState);
  const lastRunPerNode = useAtomValue(lastRunDataByNodeState);
  const selectedProcessPagePerNode = useAtomValue(selectedProcessPageNodesState);
  const zoomSensitivity = useAtomValue(zoomSensitivityState);
  const previewConnections = useAtomValue(canvasPreviewConnectionsState);

  const setLastSavedCanvasPosition = useSetAtom(lastCanvasPositionByGraphState);
  const setLastMousePosition = useSetAtom(lastMousePositionState);

  const { clientToCanvasPosition } = useCanvasPositioning();
  const removeNodes = useDeleteNodesCommand();
  const editNode = useEditNodeCommand();
  const cache = useNodeHeightCache();
  const nodeTypes = useNodeTypes();

  const { selectionBox, startSelectionBox, updateSelectionBox, endSelectionBox } = useSelectionBox();
  const {
    hoveringPort,
    hoveringShowPortInfo,
    onPortMouseOver,
    onPortMouseOut,
    floatingStyles,
    floatingRefs,
  } = usePortHoverTooltip();

  const {
    dragAxisLock,
    dragMode,
    draggingConnectionSourceNodeIds,
    draggingNodes,
    draggedSourceNodeIds,
    onNodeDragActivatorPointerDown,
    onNodeDragCancelled,
    onNodeDraggedMove,
    onNodeStartDrag,
    onNodeDragged,
  } = useDraggingNode();
  const { draggingWire, onWireStartDrag, onWireEndDrag } = useDraggingWire(onConnectionsChanged);
  const isDraggingNode = draggingNodes.length > 0;
  const isDraggingWire = !!draggingWire;

  const shouldRenderWires = canvasPosition.zoom > 0.15;
  const viewportBounds = useViewportBounds();
  const draggingViewportNodeIds = useMemo(
    () => [...new Set([...draggedSourceNodeIds, ...draggingNodes.map((node) => node.id)])],
    [draggedSourceNodeIds, draggingNodes],
  );

  const {
    contextMenuRef,
    showContextMenu,
    contextMenuData,
    handleContextMenu,
    setShowContextMenu,
    setContextMenuData,
  } = useContextMenu();

  const connectionsByNodeId = useMemo(() => groupConnectionsByNode(previewConnections), [previewConnections]);
  const nodesWithConnections = useMemo(
    () =>
      nodes.map((node) => ({
        node,
        nodeConnections: connectionsByNodeId[node.id] ?? EMPTY_NODE_CONNECTIONS,
      })),
    [connectionsByNodeId, nodes],
  );

  const draggingNodeConnections = useMemo(
    () => {
      const draggingNodeIdSet = new Set(draggingConnectionSourceNodeIds);

      return previewConnections.filter(
        (connection) =>
          draggingNodeIdSet.has(connection.inputNodeId) || draggingNodeIdSet.has(connection.outputNodeId),
      );
    },
    [draggingConnectionSourceNodeIds, previewConnections],
  );

  const contextMenuItemSelected = useStableCallback(
    (itemId: string, data: unknown, context: ContextMenuContext, meta: { x: number; y: number }) => {
      onContextMenuItemSelected?.(itemId, data, context, meta);
      setShowContextMenu(false);
    },
  );

  const {
    canvasMouseDown,
    canvasMouseMove,
    canvasMouseUp,
    handleCanvasContextMenu,
    handleZoom,
    isViewportMoving,
    lastMouseInfoRef,
    reportViewportMotion,
  } = useNodeCanvasInteractions({
    canvasPosition,
    clientToCanvasPosition,
    dragStart,
    endSelectionBox,
    isDraggingCanvas,
    nodes,
    onCanvasContextMenu: handleContextMenu,
    selectedGraphId: selectedGraphMetadata?.id,
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
  });
  useWireDragScrolling(reportViewportMotion);

  const onNodeSizeChanged = useStableCallback((node: ChartNode, nextBounds: NodeResizeBounds) => {
    onNodesChanged(
      produce(nodes, (draft) => {
        const foundNode = draft.find((candidate) => candidate.id === node.id);
        if (foundNode) {
          foundNode.visualData.x = nextBounds.x;
          foundNode.visualData.y = nextBounds.y ?? foundNode.visualData.y;
          foundNode.visualData.width = nextBounds.width;

          if (foundNode.type === 'comment' && nextBounds.height != null) {
            (foundNode as CommentNode).data.height = nextBounds.height;
          }
        }
      }),
    );
  });

  const onNodeMouseEnter = useStableCallback((_e: MouseEvent<HTMLElement>, nodeId: NodeId) => {
    setHoveringNode(nodeId);
  });

  const onNodeMouseLeave = useStableCallback(() => {
    setHoveringNode(undefined);
  });

  const selectedViewportNodeIds = useMemo(() => {
    const nextSelectedNodeIds = new Set(selectedNodeIds);

    if (editingNodeId) {
      nextSelectedNodeIds.add(editingNodeId);
    }

    return [...nextSelectedNodeIds];
  }, [editingNodeId, selectedNodeIds]);

  const highlightedNodes = useMemo(() => {
    const highlightedNodeIds = new Set(selectedViewportNodeIds);

    if (hoveringNode && !hoveringPort) {
      highlightedNodeIds.add(hoveringNode);
    }

    return [...highlightedNodeIds];
  }, [hoveringNode, hoveringPort, selectedViewportNodeIds]);
  // Freeze viewport visibility only for passive canvas motion. Interactive drags need
  // newly revealed nodes and ports to mount immediately so wire previews stay accurate.
  const shouldFreezeViewportVisibility = isViewportMoving && !isDraggingNode && !isDraggingWire;

  const {
    heavyContentNodeIdSet,
    isViewportVisibilitySettled,
    nearViewportNodeIdSet,
    visibleNodeIdSet,
  } = useVisibleCanvasNodes({
    draggingNodeIds: draggingViewportNodeIds,
    editingNodeId,
    expandedOutputNodeIds,
    hoveringNodeId: hoveringNode,
    isViewportMoving: shouldFreezeViewportVisibility,
    nodes,
    selectedNodeIds: selectedViewportNodeIds,
    viewportBounds,
  });

  const {
    nodePortPositions,
    canvasRef,
    recalculate: recalculatePortPositions,
  } = useNodePortPositions({
    enabled: shouldRenderWires,
    isDraggingNode,
    isDraggingWire,
    visibleNodeIdSet,
  });
  const autoLayout = useAutoLayoutCommand(recalculatePortPositions);

  useEffect(() => {
    autoLayoutGraph.current = () => {
      autoLayout({});
    };
  }, [autoLayout, autoLayoutGraph]);

  const { setNodeRef } = useDroppable({ id: 'NodeCanvas' });
  const setCanvasRef = useMergeRefs([setNodeRef, canvasRef]);

  const nodeSelected = useStableCallback((node: ChartNode, multi: boolean) => {
    onNodeSelected?.(node, multi);
  });

  const nodeStartEditing = useStableCallback((node: ChartNode) => {
    onNodeStartEditing?.(node);
  });

  useGlobalHotkey(
    'Space',
    (e) => {
      e.preventDefault();
      handleContextMenu({
        clientX: lastMouseInfoRef.current.x,
        clientY: lastMouseInfoRef.current.y,
        target: lastMouseInfoRef.current.target!,
      });
    },
    { notWhenInputFocused: true },
  );

  useGlobalHotkey(
    'Delete',
    (e) => {
      e.preventDefault();
      if (selectedNodeIds.length === 0) {
        return;
      }

      removeNodes({ nodeIds: selectedNodeIds });
      setSelectedNodeIds([]);
    },
    { notWhenInputFocused: true },
  );

  const hydratedContextMenuData = useMemo((): ContextMenuContext | null => {
    if (contextMenuData.data?.type.startsWith('node-')) {
      const nodeType = contextMenuData.data.type.replace('node-', '');
      const nodeId = contextMenuData.data.element.dataset.nodeid as NodeId;
      return {
        type: 'node',
        data: {
          nodeType,
          nodeId,
          canRunFromHere: lastRunPerNode[nodeId] != null,
        },
      };
    }

    return {
      type: 'blankArea',
      data: {},
    };
  }, [contextMenuData, lastRunPerNode]);

  useCanvasHotkeys();
  useSearchGraph();

  const isZoomedOut = canvasPosition.zoom < 0.4;
  const isReallyZoomedOut = canvasPosition.zoom < 0.2;

  const onResizeFinish = useStableCallback((
    node: ChartNode,
    nextBounds: NodeResizeBounds,
    previousNodeOverride?: Partial<ChartNode>,
  ) => {
    const newNode: Partial<ChartNode> = {
      visualData: {
        ...node.visualData,
        x: nextBounds.x,
        y: nextBounds.y ?? node.visualData.y,
        width: nextBounds.width,
      },
    };

    if (node.type === 'comment' && nextBounds.height != null) {
      const commentNode = node as CommentNode;
      newNode.data = {
        ...commentNode.data,
        height: nextBounds.height,
      };
    }

    editNode({
      nodeId: node.id,
      newNode,
      previousNodeOverride,
    });
  });

  const canvasViewContextValue = useMemo(
    () => ({
      canvasZoom: canvasPosition.zoom,
      closestPortToDraggingWire: closestPort,
      draggingWire,
      heightCache: cache,
      isReallyZoomedOut,
      isZoomedOut,
    }),
    [cache, canvasPosition.zoom, closestPort, draggingWire, isReallyZoomedOut, isZoomedOut],
  );

  const canvasHandlersContextValue = useMemo(
    () => ({
      onNodeMouseEnter,
      onNodeMouseLeave,
      onNodeSelected: nodeSelected,
      onNodeSizeChanged,
      onNodeStartEditing: nodeStartEditing,
      onPortMouseOut,
      onPortMouseOver,
      onResizeFinish,
      onWireEndDrag,
      onWireStartDrag,
    }),
    [
      nodeSelected,
      nodeStartEditing,
      onNodeMouseEnter,
      onNodeMouseLeave,
      onNodeSizeChanged,
      onPortMouseOut,
      onPortMouseOver,
      onResizeFinish,
      onWireEndDrag,
      onWireStartDrag,
    ],
  );

  return (
    <DndContext
      onDragStart={onNodeStartDrag}
      onDragMove={onNodeDraggedMove}
      onDragEnd={onNodeDragged}
      onDragCancel={onNodeDragCancelled}
    >
      <div
        ref={setCanvasRef}
        className="node-canvas"
        css={nodeCanvasStyles}
        onContextMenu={handleCanvasContextMenu}
        onMouseDown={canvasMouseDown}
        onMouseMove={canvasMouseMove.run}
        onMouseUp={canvasMouseUp}
        onMouseLeave={canvasMouseUp}
        onWheel={handleZoom}
        style={{
          backgroundPosition: `${canvasPosition.x - 1}px ${canvasPosition.y - 1}px`,
          backgroundSize: `${20 * canvasPosition.zoom}px ${20 * canvasPosition.zoom}px`,
        }}
      >
        <MouseIcon isDraggingNode={isDraggingNode} />
        <CopyNodesHotkeys />
        <DebugOverlay enabled={false} />
        <NodeCanvasViewport
          canvasHandlersContextValue={canvasHandlersContextValue}
          canvasPositionX={canvasPosition.x}
          canvasPositionY={canvasPosition.y}
          canvasZoom={canvasPosition.zoom}
          canvasViewContextValue={canvasViewContextValue}
          dragAxisLock={dragAxisLock}
          dragMode={dragMode}
          draggingNodeConnections={draggingNodeConnections}
          draggingNodes={draggingNodes}
          draggingSourceNodeIds={draggedSourceNodeIds}
          heavyContentNodeIdSet={heavyContentNodeIdSet}
          hoveredNodeId={hoveringPort ? undefined : hoveringNode}
          lastRunPerNode={lastRunPerNode}
          nodeTypes={nodeTypes}
          nodesWithConnections={nodesWithConnections}
          onNodeDragActivatorPointerDown={onNodeDragActivatorPointerDown}
          expandedOutputNodeIds={expandedOutputNodeIds}
          searchMatchingNodeIds={searchMatchingNodes}
          selectedNodeIds={selectedViewportNodeIds}
          selectedProcessPagePerNode={selectedProcessPagePerNode}
          visibleNodeIdSet={visibleNodeIdSet}
        />
        {hydratedContextMenuData && (
          <NodeCanvasOverlays
            connections={previewConnections}
            context={hydratedContextMenuData}
            contextMenuDisabled={contextMenuDisabled}
            contextMenuRef={contextMenuRef}
            contextMenuX={contextMenuData.x}
            contextMenuY={contextMenuData.y}
            draggingNode={isDraggingNode}
            draggingWire={draggingWire}
            floatingStyles={floatingStyles}
            highlightedNodes={highlightedNodes}
            highlightedPort={hoveringPort}
            hoveringPort={hoveringPort}
            hoveringShowPortInfo={hoveringShowPortInfo}
            isViewportMoving={isViewportMoving}
            isViewportVisibilitySettled={isViewportVisibilitySettled}
            nearViewportNodeIdSet={nearViewportNodeIdSet}
            nodePortPositions={nodePortPositions}
            onContextMenuEntered={() => {
              setContextMenuDisabled(false);
            }}
            onContextMenuExited={() => {
              setContextMenuData({ x: 0, y: 0, data: null });
              setContextMenuDisabled(true);
            }}
            onContextMenuItemSelected={contextMenuItemSelected}
            selectionBox={selectionBox}
            setFloating={floatingRefs.setFloating}
            shouldRenderWires={shouldRenderWires}
            showContextMenu={showContextMenu}
            visibleNodeIdSet={visibleNodeIdSet}
          />
        )}
        <MultiNodeAlignmentToolbar
          canvasRootRef={canvasRef}
          selectedNodes={selectedNodes}
        />
      </div>
    </DndContext>
  );
};

const DebugOverlay: FC<{ enabled: boolean }> = ({ enabled }) => {
  const canvasPosition = useAtomValue(canvasPositionState);
  const lastMousePosition = useAtomValue(lastMousePositionState);
  const { clientToCanvasPosition } = useCanvasPositioning();

  if (!enabled) {
    return null;
  }

  const perfSnapshot = getCanvasPerfSnapshot();

  return (
    <div className="debug-overlay">
      <div>Translation: {`(${canvasPosition.x.toFixed(2)}, ${canvasPosition.y.toFixed(2)})`}</div>
      <div>Scale: {canvasPosition.zoom.toFixed(2)}</div>
      <div>Mouse Position: {`(${lastMousePosition.x.toFixed(2)}, ${lastMousePosition.y.toFixed(2)})`}</div>
      <div>
        Translated Mouse Position:{' '}
        {`(${clientToCanvasPosition(lastMousePosition.x, lastMousePosition.y).x.toFixed(2)}, ${clientToCanvasPosition(
          lastMousePosition.x,
          lastMousePosition.y,
        ).y.toFixed(2)})`}
      </div>
      <div>Medium graph threshold: {MEDIUM_GRAPH_NODE_THRESHOLD}</div>
      {perfSnapshot.map(({ name, value }) => (
        <div key={name}>
          {name}: {value.toFixed(2)}
        </div>
      ))}
    </div>
  );
};

export const CopyNodesHotkeys: FC = () => {
  useCopyNodesHotkeys();
  return null;
};
