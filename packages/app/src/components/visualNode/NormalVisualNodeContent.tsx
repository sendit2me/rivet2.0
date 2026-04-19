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
import { match } from 'ts-pattern';
import {
  type ChartNode,
  IF_PORT,
  type NodeConnection,
  type PortId,
} from '@ironclad/rivet-core';
import type { HeightCache } from '../../hooks/useNodeBodyHeight';
import type { SelectedProcessRunProp } from '../VisualNode';
import SettingsCogIcon from 'majesticons/line/settings-cog-line.svg?react';
import SendIcon from 'majesticons/solid/send.svg?react';
import BookIcon from 'majesticons/line/book-open-line.svg?react';
import { ResizeHandle } from '../ResizeHandle.js';
import { useCanvasPositioning } from '../../hooks/useCanvasPositioning.js';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
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
  computeHorizontalNodeResizeBounds,
  DEFAULT_NODE_WIDTH,
  haveHorizontalNodeResizeBoundsChanged,
  type HorizontalNodeResizeDirection,
} from '../../utils/nodeResize.js';

export const NormalVisualNodeContent: FC<{
  heightCache: HeightCache;
  node: ChartNode;
  connections?: NodeConnection[];
  handleAttributes?: HTMLAttributes<HTMLDivElement>;
  isKnownNodeType: boolean;
  selectedProcessRun?: SelectedProcessRunProp['selectedProcessRun'];
  isHistoricalChanged: boolean;
}> = memo(
  ({
    heightCache,
    node,
    connections = [],
    selectedProcessRun,
    handleAttributes,
    isKnownNodeType,
    isHistoricalChanged,
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
      direction: HorizontalNodeResizeDirection;
      initialWidth: number;
      initialX: number;
      initialMouseX: number;
      previousNodeOverride: Partial<ChartNode>;
    } | null>(null);
    const [shiftHeld, setShiftHeld] = useState(false);

    const getNodeCurrentWidth = (elementOrChild: HTMLElement): number => {
      const nodeElement = elementOrChild.closest('.node');
      if (!nodeElement) {
        return DEFAULT_NODE_WIDTH;
      }

      const cssWidth = window.getComputedStyle(nodeElement).width;
      const width = Number.parseFloat(cssWidth);

      return Number.isFinite(width) ? width : (node.visualData.width ?? DEFAULT_NODE_WIDTH);
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

      const initialMousePositionCanvas = clientToCanvasPosition(resizeState.initialMouseX, 0);
      const newMousePositionCanvas = clientToCanvasPosition(event.clientX, 0);
      const deltaX = newMousePositionCanvas.x - initialMousePositionCanvas.x;

      return computeHorizontalNodeResizeBounds({
        direction: resizeState.direction,
        initialWidth: resizeState.initialWidth,
        initialX: resizeState.initialX,
        deltaX,
      });
    });

    const handleResizeStart = useStableCallback((direction: HorizontalNodeResizeDirection, event: globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      setResizeState({
        direction,
        initialWidth: getNodeCurrentWidth(event.target as HTMLElement),
        initialX: node.visualData.x,
        initialMouseX: event.clientX,
        previousNodeOverride: structuredClone(node),
      });
    });

    const handleResizeMove = useStableCallback((event: globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const nextBounds = getNextResizeBounds(event);
      const currentBounds = {
        x: node.visualData.x,
        width: node.visualData.width ?? resizeState?.initialWidth ?? DEFAULT_NODE_WIDTH,
      };

      if (nextBounds && haveHorizontalNodeResizeBoundsChanged(currentBounds, nextBounds)) {
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
        haveHorizontalNodeResizeBoundsChanged(
          {
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
            <div className="last-run-status">
              {selectedProcessRun?.status ? (
                match(selectedProcessRun.status)
                  .with({ type: 'ok' }, () => <Tooltip content="This node ran successfully"><div className="success"><SendIcon /></div></Tooltip>)
                  .with({ type: 'error' }, () => <Tooltip content="This node errored"><div className="error"><SendIcon /></div></Tooltip>)
                  .with({ type: 'running' }, () => <Tooltip content="This node is currently running"><div className="running"><LoadingSpinner /></div></Tooltip>)
                  .with({ type: 'interrupted' }, () => <Tooltip content="This node was interrupted"><div className="interrupted"><SendIcon /></div></Tooltip>)
                  .with({ type: 'notRan' }, () => <Tooltip content="This node was not ran due to control flow"><div className="not-ran"><SendIcon /></div></Tooltip>)
                  .exhaustive()
              ) : (
                <></>
              )}
            </div>
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
          {isKnownNodeType ? <NodeBody heightCache={heightCache} node={node} /> : <div>Unknown node type {node.type} - are you missing a plugin?</div>}
        </ErrorBoundary>

        {isKnownNodeType && <NodePortsRenderer node={node} connections={connections} />}

        <ErrorBoundary fallback={<div>Error rendering node output</div>}>
          <NodeOutput node={node} />
        </ErrorBoundary>
        <div className="node-resize-handles">
          <ResizeHandle
            className="resize-handle resize-handle-left"
            onResizeStart={(event) => handleResizeStart('left', event)}
            onResizeMove={handleResizeMove}
            onResizeEnd={handleResizeEnd}
          />
          <ResizeHandle
            className="resize-handle resize-handle-right"
            onResizeStart={(event) => handleResizeStart('right', event)}
            onResizeMove={handleResizeMove}
            onResizeEnd={handleResizeEnd}
          />
        </div>
      </>
    );
  },
);

NormalVisualNodeContent.displayName = 'NormalVisualNodeContent';
