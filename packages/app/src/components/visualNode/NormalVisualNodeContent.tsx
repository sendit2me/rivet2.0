import clsx from 'clsx';
import { type FC, type HTMLAttributes, type MouseEvent as ReactMouseEvent, memo, useState } from 'react';
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
import { currentGraphViewState, graphRunHistoryByViewState, selectedGraphRunByViewState, type ProcessDataForNode } from '../../state/dataFlow.js';
import SettingsCogIcon from 'majesticons/line/settings-cog-line.svg?react';
import SendIcon from 'majesticons/solid/send.svg?react';
import GitForkLine from 'majesticons/line/git-fork-line.svg?react';
import PinIcon from 'majesticons/line/pin-line.svg?react';
import PinSolidIcon from 'majesticons/solid/pin.svg?react';
import BookIcon from 'majesticons/line/book-open-line.svg?react';
import { ResizeHandle } from '../ResizeHandle.js';
import { useCanvasPositioning } from '../../hooks/useCanvasPositioning.js';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { NodePortsRenderer } from '../NodePorts.js';
import { useDependsOnPlugins } from '../../hooks/useDependsOnPlugins';
import { pinnedNodesState, viewingNodeChangesState } from '../../state/graphBuilder';
import { Tooltip } from '../Tooltip';
import { Port } from '../Port';
import { preservePortTextCaseState } from '../../state/settings';
import { useCanvasHandlersContext, useCanvasViewContext } from '../CanvasContext';
import { NodeBody } from '../NodeBody.js';
import { NodeOutput } from '../NodeOutput.js';
import { getGraphSelectionOptions, getSelectedProcessRun } from '../../state/selectors/executionSelectors.js';

export const NormalVisualNodeContent: FC<{
  heightCache: HeightCache;
  node: ChartNode;
  connections?: NodeConnection[];
  handleAttributes?: HTMLAttributes<HTMLDivElement>;
  isKnownNodeType: boolean;
  lastRun?: ProcessDataForNode[];
  processPage: number | 'latest';
  isPinned: boolean;
  isHistoricalChanged: boolean;
  isHovered: boolean;
}> = memo(
  ({
    heightCache,
    node,
    connections = [],
    lastRun,
    processPage,
    isPinned,
    handleAttributes,
    isKnownNodeType,
    isHistoricalChanged,
    isHovered,
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
    const setPinnedNodes = useSetAtom(pinnedNodesState);
    const setViewingNodeChanges = useSetAtom(viewingNodeChangesState);
    const preservePortTextCase = useAtomValue(preservePortTextCaseState);
    const currentGraphView = useAtomValue(currentGraphViewState);
    const graphRunHistoryByView = useAtomValue(graphRunHistoryByViewState);
    const selectedGraphRunByView = useAtomValue(selectedGraphRunByViewState);

    const [initialHeight, setInitialHeight] = useState<number | undefined>();
    const [initialWidth, setInitialWidth] = useState<number | undefined>();
    const [initialMouseX, setInitialMouseX] = useState(0);
    const [initialMouseY, setInitialMouseY] = useState(0);
    const [shiftHeld, setShiftHeld] = useState(false);

    const graphSelectionOptions = getGraphSelectionOptions({
      currentGraphView,
      graphRunHistoryByView,
      selectedGraphRunByView,
    });
    const selectedProcessRun = getSelectedProcessRun(lastRun, processPage, graphSelectionOptions);

    const getNodeCurrentDimensions = (elementOrChild: HTMLElement): [number, number] => {
      const nodeElement = elementOrChild.closest('.node');
      if (!nodeElement) {
        return [100, 100];
      }

      const cssWidth = window.getComputedStyle(nodeElement).width;
      const cssHeight = window.getComputedStyle(nodeElement).height;

      return [parseInt(cssWidth, 10), parseInt(cssHeight, 10)];
    };

    const handleEditClick = useStableCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onNodeStartEditing?.(node);
    });

    const handleEditMouseDown = useStableCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
    });

    const handleResizeStart = useStableCallback((event: globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const [width, height] = getNodeCurrentDimensions(event.target as HTMLElement);
      setInitialWidth(width);
      setInitialHeight(height);
      setInitialMouseX(event.clientX);
      setInitialMouseY(event.clientY);
    });

    const handleResizeMove = useStableCallback((event: globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const initialMousePositionCanvas = clientToCanvasPosition(initialMouseX, initialMouseY);
      const newMousePositionCanvas = clientToCanvasPosition(event.clientX, event.clientY);
      const deltaX = newMousePositionCanvas.x - initialMousePositionCanvas.x;
      const deltaY = newMousePositionCanvas.y - initialMousePositionCanvas.y;

      const newWidth = initialWidth != null ? initialWidth + deltaX : initialWidth;
      const newHeight = initialHeight != null ? initialHeight + deltaY : initialHeight;

      if (newWidth != null && newHeight != null && (newWidth !== initialWidth || newHeight !== initialHeight)) {
        onNodeSizeChanged?.(node, newWidth, newHeight);
      }
    });

    const handleResizeEnd = useStableCallback((event: globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      onResizeFinish?.(node, initialWidth ?? 200, initialHeight ?? 200);
      setInitialWidth(undefined);
      setInitialHeight(undefined);
      setInitialMouseX(0);
      setInitialMouseY(0);
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

    const togglePinned = useStableCallback(() => {
      setPinnedNodes((previous) =>
        previous.includes(node.id) ? previous.filter((nodeId) => nodeId !== node.id) : [...previous, node.id],
      );
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

    return (
      <>
        <div className="node-title" onMouseMove={watchShift}>
          <div className={clsx('grab-area', { grabbable: !shiftHeld })} {...(shiftHeld ? {} : handleAttributes)} onClick={handleGrabClick}>
            {node.isSplitRun ? <GitForkLine /> : <></>}
            <div className="title-text">{node.title}</div>
          </div>
          <div className="title-controls">
            {isHistoricalChanged && (
              <button onClick={viewChanges} className="changed-button">
                <Tooltip content="This node was changed, click to view changes">
                  <BookIcon />
                </Tooltip>
              </button>
            )}
            <button className={clsx('pin-button', { pinned: isPinned })} onClick={togglePinned}>
              <Tooltip content="Pin node (always show entire output)">{isPinned ? <PinSolidIcon /> : <PinIcon />}</Tooltip>
            </button>
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
            <Tooltip content="Edit Node">
              <button
                className="edit-button"
                onClick={(event) => {
                  if (isKnownNodeType) {
                    handleEditClick(event);
                  }
                }}
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
          <NodeOutput node={node} isHovered={isHovered} />
        </ErrorBoundary>
        <div className="node-resize">
          <ResizeHandle onResizeStart={handleResizeStart} onResizeMove={handleResizeMove} onResizeEnd={handleResizeEnd} />
        </div>
      </>
    );
  },
);

NormalVisualNodeContent.displayName = 'NormalVisualNodeContent';
