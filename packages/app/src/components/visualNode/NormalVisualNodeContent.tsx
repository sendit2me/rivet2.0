import clsx from 'clsx';
import {
  type FC,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  memo,
  useState,
} from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  type ChartNode,
  type CommentNode,
  IF_PORT,
  type NodeConnection,
  type PortId,
} from '@ironclad/rivet-core';
import type { HeightCache } from '../../hooks/useNodeBodyHeight';
import SettingsCogIcon from 'majesticons/line/settings-cog-line.svg?react';
import BookIcon from 'majesticons/line/book-open-line.svg?react';
import { ResizeHandle } from '../ResizeHandle.js';
import { useCanvasPositioning } from '../../hooks/useCanvasPositioning.js';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import { NodePortsRenderer } from '../NodePorts.js';
import { useDependsOnPlugins } from '../../hooks/useDependsOnPlugins';
import { viewingNodeChangesState } from '../../state/graphBuilder';
import { Tooltip } from '../Tooltip';
import { Port } from '../Port';
import { preservePortTextCaseState } from '../../state/settings';
import { useCanvasHandlersContext, useCanvasViewContext } from '../CanvasContext';
import { NodeBody } from '../NodeBody.js';
import { NodeOutput } from '../NodeOutput.js';
import { SplitRunModeIcon } from './SplitRunModeIcon.js';
import {
  computeBoxNodeResizeBounds,
  computeHorizontalNodeResizeBounds,
  DEFAULT_NODE_WIDTH,
  haveNodeResizeBoundsChanged,
  type BoxNodeResizeDirection,
  type NodeResizeBounds,
} from '../../utils/nodeResize.js';

export const NormalVisualNodeContent: FC<{
  heightCache: HeightCache;
  node: ChartNode;
  connections?: NodeConnection[];
  handleAttributes?: HTMLAttributes<HTMLDivElement>;
  isKnownNodeType: boolean;
  isHistoricalChanged: boolean;
  isRunning: boolean;
  renderHeavyContent: boolean;
}> = memo(
  ({
    heightCache,
    node,
    connections = [],
    handleAttributes,
    isKnownNodeType,
    isHistoricalChanged,
    isRunning,
    renderHeavyContent,
  }) => {
    useDependsOnPlugins();
    const { draggingWire, closestPortToDraggingWire } = useCanvasViewContext();
    const {
      onNodeSelected,
      onNodeSizeChanged,
      onNodeStartEditing,
      onPortMouseOut,
      onPortMouseOver,
      onResizeFinish,
      onWireEndDrag,
      onWireStartDrag,
    } = useCanvasHandlersContext();
    const { clientToCanvasPosition } = useCanvasPositioning();
    const setViewingNodeChanges = useSetAtom(viewingNodeChangesState);
    const preservePortTextCase = useAtomValue(preservePortTextCaseState);

    const [resizeState, setResizeState] = useState<{
      direction: BoxNodeResizeDirection;
      initialHeight: number;
      initialWidth: number;
      initialX: number;
      initialY: number;
      initialMouseX: number;
      initialMouseY: number;
      previousNodeOverride: Partial<ChartNode>;
    } | null>(null);
    const [shiftHeld, setShiftHeld] = useState(false);
    const isComment = node.type === 'comment';
    const getNodeHeight = () => (node.type === 'comment' ? (node as CommentNode).data.height : 0);

    const getNodeCurrentBounds = (elementOrChild: HTMLElement): Required<NodeResizeBounds> => {
      const nodeElement = elementOrChild.closest('.node');
      if (!nodeElement) {
        return {
          x: node.visualData.x,
          y: node.visualData.y,
          width: node.visualData.width ?? DEFAULT_NODE_WIDTH,
          height: getNodeHeight(),
        };
      }

      const computedStyle = window.getComputedStyle(nodeElement);
      const width = Number.parseFloat(computedStyle.width);
      const height = Number.parseFloat(computedStyle.height);

      return {
        x: node.visualData.x,
        y: node.visualData.y,
        width: Number.isFinite(width) ? width : (node.visualData.width ?? DEFAULT_NODE_WIDTH),
        height: Number.isFinite(height) ? height : getNodeHeight(),
      };
    };

    const handleEditClick = useStableCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onNodeStartEditing?.(node);
    });

    const handleEditMouseDown = useStableCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
    });

    const handleEditPointerDown = useStableCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    });

    const getNextResizeBounds = useStableCallback((event: globalThis.MouseEvent) => {
      if (!resizeState) {
        return null;
      }

      const initialMousePositionCanvas = clientToCanvasPosition(resizeState.initialMouseX, resizeState.initialMouseY);
      const newMousePositionCanvas = clientToCanvasPosition(event.clientX, event.clientY);
      const deltaX = newMousePositionCanvas.x - initialMousePositionCanvas.x;
      const deltaY = newMousePositionCanvas.y - initialMousePositionCanvas.y;

      if (isComment) {
        return computeBoxNodeResizeBounds({
          direction: resizeState.direction,
          initialHeight: resizeState.initialHeight,
          initialWidth: resizeState.initialWidth,
          initialX: resizeState.initialX,
          initialY: resizeState.initialY,
          deltaX,
          deltaY,
        });
      }

      return computeHorizontalNodeResizeBounds({
        direction: resizeState.direction === 'left' ? 'left' : 'right',
        initialWidth: resizeState.initialWidth,
        initialX: resizeState.initialX,
        deltaX,
      });
    });

    const handleResizeStart = useStableCallback((direction: BoxNodeResizeDirection, event: globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const currentBounds = getNodeCurrentBounds(event.target as HTMLElement);

      setResizeState({
        direction,
        initialHeight: currentBounds.height,
        initialWidth: currentBounds.width,
        initialX: currentBounds.x,
        initialY: currentBounds.y,
        initialMouseX: event.clientX,
        initialMouseY: event.clientY,
        previousNodeOverride: structuredClone(node),
      });
    });

    const handleResizeMove = useStableCallback((event: globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const nextBounds = getNextResizeBounds(event);
      const currentBounds = isComment
        ? {
            x: node.visualData.x,
            y: node.visualData.y,
            width: node.visualData.width ?? resizeState?.initialWidth ?? DEFAULT_NODE_WIDTH,
            height: getNodeHeight(),
          }
        : {
            x: node.visualData.x,
            width: node.visualData.width ?? resizeState?.initialWidth ?? DEFAULT_NODE_WIDTH,
          };

      if (nextBounds && haveNodeResizeBoundsChanged(currentBounds, nextBounds)) {
        onNodeSizeChanged?.(node, nextBounds);
      }
    });

    const handleResizeEnd = useStableCallback((event: globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const nextBounds = getNextResizeBounds(event);

      if (
        resizeState &&
        nextBounds &&
        haveNodeResizeBoundsChanged(
          isComment
            ? {
                x: resizeState.initialX,
                y: resizeState.initialY,
                width: resizeState.initialWidth,
                height: resizeState.initialHeight,
              }
            : {
                x: resizeState.initialX,
                width: resizeState.initialWidth,
              },
          nextBounds,
        )
      ) {
        onResizeFinish?.(node, nextBounds, resizeState.previousNodeOverride);
      }

      setResizeState(null);
    });

    const watchShift = useStableCallback((event: ReactMouseEvent) => {
      if (event.shiftKey !== shiftHeld) {
        setShiftHeld(event.shiftKey);
      }
    });

    const handleGrabClick = useStableCallback((event: ReactMouseEvent) => {
      event.stopPropagation();
      onNodeSelected?.(node, event.shiftKey);
    });

    const viewChanges = () => {
      if (isHistoricalChanged) {
        setViewingNodeChanges(node.id);
      }
    };

    const handleIfPortMouseDown = useStableCallback(
      (event: ReactMouseEvent<HTMLDivElement>, port: PortId, isInput: boolean) => {
        event.stopPropagation();
        event.preventDefault();
        onWireStartDrag?.(event, node.id, port, isInput);
      },
    );

    const handleIfPortMouseUp = useStableCallback((event: ReactMouseEvent<HTMLDivElement>, port: PortId) => {
      onWireEndDrag?.(event, node.id, port);
    });

    const ifConnected =
      connections.some((connection) => connection.inputNodeId === node.id && connection.inputId === IF_PORT.id) ||
      (draggingWire?.endNodeId === node.id && draggingWire?.endPortId === IF_PORT.id);
    const splitRunMaxLabel = `max ${node.splitRunMax ?? 10}`;
    const resizeDirections: BoxNodeResizeDirection[] = isComment
      ? ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
      : ['left', 'right'];

    return (
      <>
        <div
          className={clsx('node-title', { grabbable: !shiftHeld })}
          {...(shiftHeld ? {} : handleAttributes)}
          onMouseMove={watchShift}
          onClick={handleGrabClick}
        >
          <div className="grab-area">
            {node.isSplitRun ? <SplitRunModeIcon isSequential={node.isSplitSequential} /> : <></>}
            <div className="title-text">
              <span className="title-text-label">{node.title}</span>
            </div>
          </div>
          <div className="title-controls">
            {isHistoricalChanged && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  viewChanges();
                }}
                onPointerDown={handleEditPointerDown}
                onMouseDown={handleEditMouseDown}
                className="changed-button"
              >
                <Tooltip content="This node was changed, click to view changes">
                  <BookIcon />
                </Tooltip>
              </button>
            )}
            {node.isSplitRun && (
              <Tooltip content="Edit Node">
                <button
                  type="button"
                  className="split-run-max-button"
                  onClick={handleEditClick}
                  onPointerDown={handleEditPointerDown}
                  onMouseDown={handleEditMouseDown}
                >
                  <span className="split-run-max-badge">{splitRunMaxLabel}</span>
                </button>
              </Tooltip>
            )}
            {isRunning && (
              <span className="node-running-indicator" aria-label="Node running" role="status" />
            )}
            <Tooltip content="Edit Node">
              <button
                type="button"
                className="edit-button"
                onClick={(event) => {
                  if (isKnownNodeType) {
                    handleEditClick(event);
                  }
                }}
                onPointerDown={handleEditPointerDown}
                onMouseDown={handleEditMouseDown}
              >
                <SettingsCogIcon />
              </button>
            </Tooltip>
          </div>
        </div>

        {node.isConditional && (
          <div className="node-title-ports input-ports">
            <Port
              connected={ifConnected}
              canDragTo={draggingWire ? !draggingWire.startPortIsInput : false}
              closest={closestPortToDraggingWire?.nodeId === node.id && closestPortToDraggingWire.portId === IF_PORT.id}
              id={'$if' as PortId}
              definition={IF_PORT}
              nodeId={node.id}
              title="if"
              input
              preservePortCase={preservePortTextCase}
              onMouseOver={onPortMouseOver}
              onMouseOut={onPortMouseOut}
              onMouseDown={handleIfPortMouseDown}
              onMouseUp={handleIfPortMouseUp}
            />
          </div>
        )}

        <ErrorBoundary fallback={<div>Error rendering node body</div>}>
          {isKnownNodeType ? (
            <NodeBody heightCache={heightCache} node={node} suspended={!renderHeavyContent} />
          ) : (
            <div>Unknown node type {node.type} - are you missing a plugin?</div>
          )}
        </ErrorBoundary>

        {isKnownNodeType && <NodePortsRenderer node={node} connections={connections} />}

        <ErrorBoundary fallback={<div>Error rendering node output</div>}>
          <NodeOutput node={node} suspended={!renderHeavyContent} />
        </ErrorBoundary>
        <div className="node-resize-handles">
          {resizeDirections.map((direction) => (
            <ResizeHandle
              key={direction}
              className={`resize-handle resize-handle-${direction}`}
              onResizeStart={(event) => handleResizeStart(direction, event)}
              onResizeMove={handleResizeMove}
              onResizeEnd={handleResizeEnd}
            />
          ))}
        </div>
      </>
    );
  },
);

NormalVisualNodeContent.displayName = 'NormalVisualNodeContent';
