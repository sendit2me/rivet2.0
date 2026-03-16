import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { useNodeHeightCache } from '../hooks/useNodeBodyHeight';
import { DraggableNode } from './DraggableNode.js';
import { css } from '@emotion/react';
import { nodeStyles } from './nodeStyles.js';
import {
  type FC,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  useEffect,
  type MutableRefObject,
} from 'react';
import { useSelectionBox } from '../hooks/useSelectionBox.js';
import { usePortHoverTooltip } from '../hooks/usePortHoverTooltip.js';
import { ContextMenu, type ContextMenuContext } from './ContextMenu.js';
import { CSSTransition } from 'react-transition-group';
import { WireLayer } from './WireLayer.js';
import { useContextMenu } from '../hooks/useContextMenu.js';
import { useDraggingNode } from '../hooks/useDraggingNode.js';
import { useDraggingWire } from '../hooks/useDraggingWire.js';
import {
  type ChartNode,
  type CommentNode,
  type NodeConnection,
  type NodeId,
} from '@ironclad/rivet-core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  type CanvasPosition,
  canvasPositionState,
  editingNodeState,
  lastCanvasPositionByGraphState,
  lastMousePositionState,
  selectedNodesState,
  searchMatchingNodeIdsState,
  draggingWireClosestPortState,
  hoveringNodeState,
  pinnedNodesState,
} from '../state/graphBuilder';
import { useCanvasPositioning } from '../hooks/useCanvasPositioning.js';
import { VisualNode } from './VisualNode.js';
import { useStableCallback } from '../hooks/useStableCallback.js';
import { useThrottleFn } from 'ahooks';
import { produce } from 'immer';
import { graphMetadataState, graphState, nodesState } from '../state/graph.js';
import { useViewportBounds } from '../hooks/useViewportBounds.js';
import { useGlobalHotkey } from '../hooks/useGlobalHotkey.js';
import { useWireDragScrolling } from '../hooks/useWireDragScrolling';
import { useMergeRefs } from '@floating-ui/react';
import { useNodePortPositions } from '../hooks/useNodePortPositions';
import { useCopyNodesHotkeys } from '../hooks/useCopyNodesHotkeys';
import { useCanvasHotkeys } from '../hooks/useCanvasHotkeys';
import { useSearchGraph } from '../hooks/useSearchGraph';
import { zoomSensitivityState } from '../state/settings';
import { MouseIcon } from './MouseIcon';
import { PortInfo } from './PortInfo';
import { useNodeTypes } from '../hooks/useNodeTypes';
import { lastRunDataByNodeState, selectedProcessPageNodesState } from '../state/dataFlow';
import { useDeleteNodesCommand } from '../commands/deleteNodeCommand';
import { useEditNodeCommand } from '../commands/editNodeCommand';
import { useAutoLayoutGraph } from '../hooks/useAutoLayoutGraph';
import { CanvasHandlersContext, CanvasViewContext } from './CanvasContext';
import { useVisibleCanvasNodes } from '../hooks/useVisibleCanvasNodes';

const styles = css`
  width: 100vw;
  height: 100vh;
  position: relative;
  background-color: var(--grey-darker);
  background-image: linear-gradient(to right, var(--grey-subtle-accent) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grey-subtle-accent) 1px, transparent 1px);
  background-size: 20px 20px;
  background-position: -1px -1px;
  overflow: hidden;
  z-index: 0;

  .nodes {
    position: relative;
    z-index: 0;
  }

  .context-menu {
    position: absolute;
    display: none;
  }

  .context-menu-enter {
    display: block;
    opacity: 0;
    position: absolute;
  }

  .context-menu-enter-active {
    opacity: 1;
    transition: opacity 100ms ease-out;
    position: absolute;
  }

  .context-menu-exit {
    opacity: 1;
    position: absolute;
  }

  .context-menu-exit-active {
    opacity: 0;
    transition: opacity 100ms ease-out;
    position: absolute;
  }

  .context-menu-exit-done {
    opacity: 0;
    position: absolute;
    left: -1000px;
  }

  .debug-overlay {
    position: absolute;
    top: 50px;
    left: 50px;
    padding: 10px 20px;
    border-radius: 5px;
    background-color: rgba(255, 255, 255, 0.03);
    color: var(--foreground);
    box-shadow: 0 2px 4px var(--shadow);
    z-index: 99999;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .canvas-contents {
    transform-origin: top left;
  }

  .origin {
    position: absolute;
    left: -5px;
    top: -5px;
  }

  .selection-box {
    position: absolute;
    border: 2px dashed var(--primary);
    background-color: var(--primary-5percent);
    z-index: 2000;
  }

  ${nodeStyles}
`;

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
  connections,
  onNodesChanged,
  onConnectionsChanged,
  onNodeSelected,
  onNodeStartEditing,
  onContextMenuItemSelected,
  autoLayoutGraph,
}) => {
  const [canvasPosition, setCanvasPosition] = useAtom(canvasPositionState);
  const selectedGraphMetadata = useAtomValue(graphMetadataState);

  const setLastSavedCanvasPosition = useSetAtom(lastCanvasPositionByGraphState);

  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, canvasStartX: 0, canvasStartY: 0 });
  const { clientToCanvasPosition } = useCanvasPositioning();
  const setLastMousePosition = useSetAtom(lastMousePositionState);
  const removeNodes = useDeleteNodesCommand();

  const { selectionBox, startSelectionBox, updateSelectionBox, endSelectionBox } = useSelectionBox();
  const {
    hoveringPort,
    hoveringShowPortInfo,
    onPortMouseOver,
    onPortMouseOut,
    floatingStyles,
    floatingRefs,
  } = usePortHoverTooltip();

  const lastMouseInfoRef = useRef<{ x: number; y: number; target: EventTarget | undefined }>({
    x: -3000,
    y: 0,
    target: undefined,
  });

  const [editingNodeId, setEditingNodeId] = useAtom(editingNodeState);
  const [selectedNodeIds, setSelectedNodeIds] = useAtom(selectedNodesState);

  const { draggingNodes, onNodeStartDrag, onNodeDragged } = useDraggingNode(onNodesChanged);
  const { draggingWire, onWireStartDrag, onWireEndDrag } = useDraggingWire(onConnectionsChanged);
  useWireDragScrolling();

  const cache = useNodeHeightCache();

  const graph = useAtomValue(graphState);
  const setNodes = useSetAtom(nodesState);

  const {
    contextMenuRef,
    showContextMenu,
    contextMenuData,
    handleContextMenu,
    setShowContextMenu,
    setContextMenuData,
  } = useContextMenu();

  const shouldRenderWires = canvasPosition.zoom > 0.15;

  const {
    nodePortPositions,
    canvasRef,
    recalculate: recalculatePortPositions,
  } = useNodePortPositions({ enabled: shouldRenderWires, isDraggingNode: draggingNodes.length > 0 });

  const autoLayout = useAutoLayoutGraph();

  useEffect(() => {
    autoLayoutGraph.current = () => {
      const nodes = autoLayout(graph);
      setNodes(nodes);
      recalculatePortPositions();
    };
  }, [autoLayout, autoLayoutGraph, recalculatePortPositions, setNodes, graph]);

  useEffect(() => {
    recalculatePortPositions();
  }, [recalculatePortPositions, selectedGraphMetadata?.id]);

  const { setNodeRef } = useDroppable({ id: 'NodeCanvas' });
  const setCanvasRef = useMergeRefs([setNodeRef, canvasRef]);

  const nodesWithConnections = useMemo(() => {
    return nodes.map((node) => {
      const nodeConnections = connections.filter((c) => c.inputNodeId === node.id || c.outputNodeId === node.id);
      return { node, nodeConnections };
    });
  }, [connections, nodes]);

  const draggingNodeConnections = useMemo(() => {
    return draggingNodes.flatMap((draggingNode) =>
      connections.filter((c) => c.inputNodeId === draggingNode.id || c.outputNodeId === draggingNode.id),
    );
  }, [connections, draggingNodes]);

  const contextMenuItemSelected = useStableCallback(
    (itemId: string, data: unknown, context: ContextMenuContext, meta: { x: number; y: number }) => {
      onContextMenuItemSelected?.(itemId, data, context, meta);
      setShowContextMenu(false);
    },
  );

  const canvasMouseDown = useStableCallback((e: React.MouseEvent) => {
    if (e.button !== 0) {
      return;
    }

    if ((e.target as HTMLElement).classList.contains('node-canvas') === false) {
      return;
    }

    e.preventDefault();

    if (e.shiftKey) {
      startSelectionBox(e.clientX, e.clientY);
    } else {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX, y: e.clientY, canvasStartX: canvasPosition.x, canvasStartY: canvasPosition.y });
    }
  });

  const canvasMouseMove = useThrottleFn(
    (e: React.MouseEvent) => {
      setLastMousePosition({ x: e.clientX, y: e.clientY });
      lastMouseInfoRef.current = { x: e.clientX, y: e.clientY, target: e.target };

      recalculatePortPositions();

      if (selectionBox) {
        const newSelectedNodeIds = updateSelectionBox(e.clientX, e.clientY, nodes, clientToCanvasPosition, selectedNodeIds);
        if (newSelectedNodeIds) {
          setSelectedNodeIds(newSelectedNodeIds);
        }
      } else if (isDraggingCanvas) {
        const dx = (e.clientX - dragStart.x) * (1 / canvasPosition.zoom);
        const dy = (e.clientY - dragStart.y) * (1 / canvasPosition.zoom);

        const position: CanvasPosition = {
          x: dragStart.canvasStartX + dx,
          y: dragStart.canvasStartY + dy,
          zoom: canvasPosition.zoom,
        };
        setCanvasPosition(position);
        setLastSavedCanvasPosition((saved) => ({ ...saved, [selectedGraphMetadata!.id!]: position }));
      }
    },
    { wait: 10 },
  );

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

  const zoomSensitivity = useAtomValue(zoomSensitivityState);

  // I think safari deals with wheel events differently, so we need to throttle the zooming
  // because otherwise it lags like CRAZY
  const zoomDebounced = useThrottleFn(
    (target: HTMLElement, wheelDelta: number, clientX: number, clientY: number) => {
      if (isAnyParentScrollable(target)) {
        return;
      }

      const zoomSpeed = zoomSensitivity / 10; // 0.25 -> 0.025;

      const zoomFactor = wheelDelta < 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
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

      setLastSavedCanvasPosition((saved) => ({ ...saved, [selectedGraphMetadata!.id!]: position }));
    },
    { wait: 25 },
  );

  const handleZoom = useStableCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    zoomDebounced.run(target, event.deltaY, event.clientX, event.clientY);
  });

  const canvasMouseUp = (e: React.MouseEvent) => {
    if (selectionBox) {
      endSelectionBox();
    } else if (!isDraggingCanvas) {
      return;
    }

    setIsDraggingCanvas(false);

    const clientDelta = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };

    // If use hasn't moved mouse much, consider it a "click"
    const distance = Math.sqrt(clientDelta.x * clientDelta.x + clientDelta.y * clientDelta.y);
    if (distance < 5) {
      setEditingNodeId(null);
      setSelectedNodeIds([]);
    }
  };

  const onNodeSizeChanged = useStableCallback((node: ChartNode, width: number, height: number) => {
    onNodesChanged(
      produce(nodes, (draft) => {
        const foundNode = draft.find((n) => n.id === node.id);
        if (foundNode) {
          foundNode.visualData.width = width;
        }

        if (foundNode?.type === 'comment') {
          (foundNode as CommentNode).data.height = height;
        }
      }),
    );
  });

  const [hoveringNode, setHoveringNode] = useAtom(hoveringNodeState);

  const closestPort = useAtomValue(draggingWireClosestPortState);

  const onNodeMouseOver = useStableCallback((_e: MouseEvent<HTMLElement>, nodeId: NodeId) => {
    setHoveringNode(nodeId);
  });

  const onNodeMouseOut = useStableCallback(() => {
    setHoveringNode(undefined);
  });

  const highlightedNodes = useMemo(() => {
    const hNodes = new Set(selectedNodeIds);

    if (editingNodeId) {
      hNodes.add(editingNodeId);
    }

    if (hoveringNode && !hoveringPort) {
      hNodes.add(hoveringNode);
    }
    return [...hNodes];
  }, [selectedNodeIds, hoveringNode, hoveringPort, editingNodeId]);

  const nodeSelected = useStableCallback((node: ChartNode, multi: boolean) => {
    onNodeSelected?.(node, multi);
  });

  const nodeStartEditing = useStableCallback((node: ChartNode) => {
    onNodeStartEditing?.(node);
  });

  const viewportBounds = useViewportBounds();

  useGlobalHotkey(
    'Space',
    (e) => {
      e.preventDefault();
      handleContextMenu({
        clientX: lastMouseInfoRef.current.x!,
        clientY: lastMouseInfoRef.current.y!,
        target: lastMouseInfoRef.current.target!,
      });
    },
    { notWhenInputFocused: true },
  );

  useGlobalHotkey(
    'Delete',
    (e) => {
      e.preventDefault();

      if (selectedNodeIds.length > 0) {
        removeNodes({ nodeIds: selectedNodeIds });
        setSelectedNodeIds([]);
      }
    },
    { notWhenInputFocused: true },
  );

  const handleCanvasContextMenu = useStableCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleContextMenu(e);
  });

  const lastRunPerNode = useAtomValue(lastRunDataByNodeState);

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

  // Idk, before we were able to unmount the context menu, but safari be weird,
  // so we move it off screen instead
  const [contextMenuDisabled, setContextMenuDisabled] = useState(true);

  useCanvasHotkeys();
  useSearchGraph();

  const searchMatchingNodes = useAtomValue(searchMatchingNodeIdsState);

  const pinnedNodes = useAtomValue(pinnedNodesState);

  const nodeTypes = useNodeTypes();
  const selectedProcessPagePerNode = useAtomValue(selectedProcessPageNodesState);

  const isZoomedOut = canvasPosition.zoom < 0.4;
  const isReallyZoomedOut = canvasPosition.zoom < 0.2;

  const { isNodeVisible } = useVisibleCanvasNodes({ nodes, pinnedNodeIds: pinnedNodes, viewportBounds });

  const editNode = useEditNodeCommand();

  const onResizeFinish = useStableCallback((node: ChartNode, width: number, height: number) => {
    editNode({
      nodeId: node.id,
      newNode: {
        visualData: {
          ...node.visualData,
          width,
        },
      },
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
      onMouseOut: onNodeMouseOut,
      onMouseOver: onNodeMouseOver,
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
      onNodeMouseOut,
      onNodeMouseOver,
      onNodeSizeChanged,
      onPortMouseOut,
      onPortMouseOver,
      onResizeFinish,
      onWireEndDrag,
      onWireStartDrag,
    ],
  );

  return (
    <DndContext onDragStart={onNodeStartDrag} onDragEnd={onNodeDragged}>
      <div
        ref={setCanvasRef}
        className="node-canvas"
        css={styles}
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
        <MouseIcon />
        <CopyNodesHotkeys />
        <DebugOverlay enabled={false} />
        <div
          className="canvas-contents"
          style={{
            transform: `scale(${canvasPosition.zoom}, ${canvasPosition.zoom}) translate(${canvasPosition.x}px, ${canvasPosition.y}px) translateZ(-1px)`,
            willChange: 'transform',
          }}
        >
          <CanvasViewContext.Provider value={canvasViewContextValue}>
            <CanvasHandlersContext.Provider value={canvasHandlersContextValue}>
              <div className="nodes">
                {nodesWithConnections.map(({ node, nodeConnections }) => {
                  if (!isNodeVisible(node)) {
                    return null;
                  }

                  if (draggingNodes.some((n) => n.id === node.id)) {
                    return null;
                  }

                  return (
                    <DraggableNode
                      key={node.id}
                      node={node}
                      connections={nodeConnections}
                      isSelected={highlightedNodes.includes(node.id) || searchMatchingNodes.includes(node.id)}
                      isKnownNodeType={node.type in nodeTypes}
                      lastRun={lastRunPerNode[node.id]}
                      isPinned={pinnedNodes.includes(node.id)}
                      processPage={selectedProcessPagePerNode[node.id]!}
                    />
                  );
                })}
              </div>
              <DragOverlay
                dropAnimation={null}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
                modifiers={[
                  (args) => {
                    return {
                      scaleX: 1,
                      scaleY: 1,
                      x: args.transform.x / canvasPosition.zoom,
                      y: args.transform.y / canvasPosition.zoom,
                    };
                  },
                ]}
              >
                {draggingNodes.map((node) => (
                  <VisualNode
                    key={node.id}
                    node={node}
                    connections={draggingNodeConnections}
                    isOverlay
                    isKnownNodeType={node.type in nodeTypes}
                    isPinned={pinnedNodes.includes(node.id)}
                    processPage={selectedProcessPagePerNode[node.id]!}
                  />
                ))}
              </DragOverlay>
            </CanvasHandlersContext.Provider>
          </CanvasViewContext.Provider>
        </div>
        <CSSTransition
          nodeRef={contextMenuRef}
          in={showContextMenu && !!hydratedContextMenuData}
          timeout={200}
          classNames="context-menu"
          onEnter={() => {
            setContextMenuDisabled(false);
          }}
          onExited={() => {
            setContextMenuData({ x: 0, y: 0, data: null });
            setContextMenuDisabled(true);
          }}
        >
          <ContextMenu
            disabled={contextMenuDisabled}
            ref={contextMenuRef}
            x={contextMenuData.x}
            y={contextMenuData.y}
            context={hydratedContextMenuData!}
            onMenuItemSelected={contextMenuItemSelected}
          />
        </CSSTransition>
        {selectionBox && (
          <div
            className="selection-box"
            style={{
              left: selectionBox.width < 0 ? selectionBox.x + selectionBox.width : selectionBox.x,
              top: selectionBox.height < 0 ? selectionBox.y + selectionBox.height : selectionBox.y,
              width: Math.abs(selectionBox.width),
              height: Math.abs(selectionBox.height),
            }}
          />
        )}

        {shouldRenderWires && (
          <WireLayer
            connections={connections}
            draggingWire={draggingWire}
            highlightedNodes={highlightedNodes}
            highlightedPort={hoveringPort}
            portPositions={nodePortPositions}
            draggingNode={draggingNodes.length > 0}
          />
        )}
        {hoveringPort && hoveringShowPortInfo && (
          <PortInfo floatingStyles={floatingStyles} ref={floatingRefs.setFloating} port={hoveringPort} />
        )}
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
    </div>
  );
};

// Optimization so that NodeCanvas doesn't rerender on mouse move
export const CopyNodesHotkeys: FC = () => {
  useCopyNodesHotkeys();

  return null;
};
