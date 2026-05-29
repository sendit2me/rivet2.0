import clsx from 'clsx';
import { type FC, type HTMLAttributes, type MouseEvent, type PointerEvent, memo } from 'react';
import { useAtomValue } from 'jotai';
import { type ChartNode, IF_PORT, type NodeConnection, type PortId } from '@valerypopoff/rivet2-core';
import SettingsCogIcon from 'majesticons/line/settings-cog-line.svg?react';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import { NodePortsRenderer } from '../NodePorts.js';
import { useDependsOnPlugins } from '../../hooks/useDependsOnPlugins';
import { Port } from '../Port';
import { preservePortTextCaseState } from '../../state/settings';
import { useCanvasHandlersContext, useCanvasViewContext } from '../CanvasContext';
import { SubGraphHeaderLink } from './SubGraphHeaderLink.js';
import { SplitRunSummary } from './SplitRunSummary.js';
import { NodeRunningIndicator } from './NodeRunningIndicator.js';
import { NodeTitleLabel } from './NodeTitleLabel.js';
import { Tooltip } from '../Tooltip.js';
import { NodeHeaderWarningIcon } from './NodeHeaderWarningIcon.js';

export const ZoomedOutVisualNodeContent: FC<{
  node: ChartNode;
  connections?: NodeConnection[];
  handleAttributes?: HTMLAttributes<HTMLDivElement>;
  isKnownNodeType: boolean;
  isReallyZoomedOut: boolean;
  showRunningIndicator: boolean;
  headerWarning?: string;
}> = memo(
  ({
    node,
    connections = [],
    handleAttributes,
    isKnownNodeType,
    isReallyZoomedOut,
    showRunningIndicator,
    headerWarning,
  }) => {
    useDependsOnPlugins();
    const { draggingWire, closestPortToDraggingWire } = useCanvasViewContext();
    const { onNodeSelected, onNodeStartEditing, onPortMouseOut, onPortMouseOver, onWireEndDrag, onWireStartDrag } =
      useCanvasHandlersContext();
    const preservePortTextCase = useAtomValue(preservePortTextCaseState);

    const handleEditClick = useStableCallback((event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onNodeStartEditing?.(node);
    });

    const handleEditMouseDown = useStableCallback((event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
    });

    const handleEditPointerDown = useStableCallback((event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    });

    const handleGrabClick = useStableCallback((event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.currentTarget.closest<HTMLElement>('.node')?.blur();
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
    const nodeDescription = node.description?.trim();

    return (
      <>
        <div
          className={clsx('node-title', { grabbable: !isReallyZoomedOut })}
          {...(isReallyZoomedOut ? {} : handleAttributes)}
          onClick={isReallyZoomedOut ? undefined : handleGrabClick}
        >
          {!isReallyZoomedOut && (
            <div className="grab-area">
              <SubGraphHeaderLink node={node} />
              <div className="title-text">
                <NodeTitleLabel node={node} />
                {nodeDescription && <span className="title-text-description">{nodeDescription}</span>}
                <SplitRunSummary node={node} isKnownNodeType={isKnownNodeType} />
              </div>
            </div>
          )}
          {!isReallyZoomedOut && (
            <div className="title-controls">
              <NodeRunningIndicator isRunning={showRunningIndicator} delayMs={0} />
              {headerWarning && (
                <Tooltip className="node-header-warning-tooltip" content={headerWarning} tag="span" wrap width={260}>
                  <span className="node-header-warning" role="img" aria-label={headerWarning}>
                    <NodeHeaderWarningIcon />
                  </span>
                </Tooltip>
              )}
              <button
                type="button"
                className="edit-button"
                onClick={handleEditClick}
                onPointerDown={handleEditPointerDown}
                onMouseDown={handleEditMouseDown}
                title="Edit"
              >
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
              closest={
                closestPortToDraggingWire?.nodeId === node.id && closestPortToDraggingWire.portId === IF_PORT.id
              }
              id={'$if' as PortId}
              definition={IF_PORT}
              nodeId={node.id}
              title="if"
              hideLabel
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
