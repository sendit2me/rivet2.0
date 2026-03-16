import { type FC, type HTMLAttributes, type MouseEvent, memo } from 'react';
import { useAtomValue } from 'jotai';
import { match } from 'ts-pattern';
import {
  type ChartNode,
  IF_PORT,
  type NodeConnection,
  type PortId,
} from '@ironclad/rivet-core';
import SettingsCogIcon from 'majesticons/line/settings-cog-line.svg?react';
import SendIcon from 'majesticons/solid/send.svg?react';
import GitForkLine from 'majesticons/line/git-fork-line.svg?react';
import { type ProcessDataForNode } from '../../state/dataFlow.js';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { NodePortsRenderer } from '../NodePorts.js';
import { useDependsOnPlugins } from '../../hooks/useDependsOnPlugins';
import { Port } from '../Port';
import { preservePortTextCaseState } from '../../state/settings';
import { useCanvasHandlersContext, useCanvasViewContext } from '../CanvasContext';

export const ZoomedOutVisualNodeContent: FC<{
  node: ChartNode;
  connections?: NodeConnection[];
  handleAttributes?: HTMLAttributes<HTMLDivElement>;
  isKnownNodeType: boolean;
  lastRun?: ProcessDataForNode[];
  processPage: number | 'latest';
  isReallyZoomedOut: boolean;
}> = memo(
  ({
    node,
    connections = [],
    handleAttributes,
    isKnownNodeType,
    lastRun,
    processPage,
    isReallyZoomedOut,
  }) => {
    useDependsOnPlugins();
    const { draggingWire, closestPortToDraggingWire } = useCanvasViewContext();
    const { onNodeSelected, onNodeStartEditing, onPortMouseOut, onPortMouseOver, onWireEndDrag, onWireStartDrag } =
      useCanvasHandlersContext();
    const preservePortTextCase = useAtomValue(preservePortTextCaseState);

    const selectedProcessRun =
      lastRun && lastRun.length > 0
        ? lastRun.at(processPage === 'latest' ? lastRun.length - 1 : processPage)?.data
        : undefined;

    const handleEditClick = useStableCallback((event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onNodeStartEditing?.(node);
    });

    const handleEditMouseDown = useStableCallback((event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
    });

    const handleGrabClick = useStableCallback((event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      onNodeSelected?.(node, event.shiftKey);
    });

    const handleIfPortMouseDown = useStableCallback(
      (event: MouseEvent<HTMLDivElement>, port: PortId, isInput: boolean) => {
        event.stopPropagation();
        event.preventDefault();
        onWireStartDrag?.(event, node.id, port, isInput);
      },
    );

    const handleIfPortMouseUp = useStableCallback((event: MouseEvent<HTMLDivElement>, port: PortId) => {
      onWireEndDrag?.(event, node.id, port);
    });

    const ifConnected =
      connections.some((connection) => connection.inputNodeId === node.id && connection.inputId === IF_PORT.id) ||
      (draggingWire?.endNodeId === node.id && draggingWire?.endPortId === IF_PORT.id);

    return (
      <>
        <div className="node-title">
          {!isReallyZoomedOut && (
            <div className="grab-area" {...handleAttributes} onClick={handleGrabClick}>
              {node.isSplitRun ? <GitForkLine /> : <></>}
              <div className="title-text">{node.title}</div>
            </div>
          )}
          {!isReallyZoomedOut && (
            <div className="title-controls">
              <div className="last-run-status">
                {selectedProcessRun?.status ? (
                  match(selectedProcessRun.status)
                    .with({ type: 'ok' }, () => <div className="success"><SendIcon /></div>)
                    .with({ type: 'error' }, () => <div className="error"><SendIcon /></div>)
                    .with({ type: 'running' }, () => <div className="running"><LoadingSpinner /></div>)
                    .with({ type: 'interrupted' }, () => <div className="interrupted"><SendIcon /></div>)
                    .with({ type: 'notRan' }, () => <div className="not-ran"><SendIcon /></div>)
                    .exhaustive()
                ) : (
                  <></>
                )}
              </div>
              <button className="edit-button" onClick={handleEditClick} onMouseDown={handleEditMouseDown} title="Edit">
                <SettingsCogIcon />
              </button>
            </div>
          )}
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

        {isKnownNodeType && <NodePortsRenderer node={node} connections={connections} zoomedOut />}
      </>
    );
  },
);

ZoomedOutVisualNodeContent.displayName = 'ZoomedOutVisualNodeContent';
