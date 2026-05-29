import {
  type DataType,
  type NodeInputDefinition,
  type NodeId,
  type PortId,
  type NodeOutputDefinition,
} from '@valerypopoff/rivet2-core';
import { type FC, useRef, type MouseEvent, memo, useMemo } from 'react';
import clsx from 'clsx';
import { useStableCallback } from '../hooks/useStableCallback';
import { getPortCompatibilityStatus } from '../domain/graphEditing/portCompatibility.js';

export function canStartWireDragFromPortLabel(input: boolean): boolean {
  return !input;
}

export const Port: FC<{
  input?: boolean;
  title: string;
  hideLabel?: boolean;
  nodeId: NodeId;
  id: PortId;
  connected?: boolean;
  canDragTo: boolean;
  closest: boolean;
  preservePortCase?: boolean;
  definition: NodeInputDefinition | NodeOutputDefinition;
  draggingDataType?: DataType | Readonly<DataType[]>;
  onMouseDown?: (event: MouseEvent<HTMLDivElement>, port: PortId, isInput: boolean) => void;
  onMouseUp?: (event: MouseEvent<HTMLDivElement>, port: PortId) => void;
  onMouseOver?: (
    event: MouseEvent<HTMLDivElement>,
    nodeId: NodeId,
    isInput: boolean,
    portId: PortId,
    definition: NodeInputDefinition | NodeOutputDefinition,
  ) => void;
  onMouseOut?: (
    event: MouseEvent<HTMLDivElement>,
    nodeId: NodeId,
    isInput: boolean,
    portId: PortId,
    definition: NodeInputDefinition | NodeOutputDefinition,
  ) => void;
}> = memo(
  ({
    input = false,
    title,
    hideLabel = false,
    nodeId,
    id,
    connected,
    canDragTo,
    closest,
    definition,
    draggingDataType,
    onMouseDown,
    onMouseUp,
    onMouseOver,
    onMouseOut,
    preservePortCase,
  }) => {
    const ref = useRef<HTMLDivElement>(null);

    const handleMouseOver = useStableCallback((event: MouseEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('.port-hover-area')) {
        return;
      }
      onMouseOver?.(event, nodeId, input, id, definition);
    });

    const handleMouseOut = useStableCallback((event: MouseEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('.port-hover-area')) {
        return;
      }
      onMouseOut?.(event, nodeId, input, id, definition);
    });

    const handleLabelMouseDown = useStableCallback((event: MouseEvent<HTMLDivElement>) => {
      if (!canStartWireDragFromPortLabel(input)) {
        return;
      }

      onMouseDown?.(event, id, input);
    });

    const definitionAsNodeInputDefinition = definition as NodeInputDefinition;
    const accepted = useMemo(() => {
      const status = getPortCompatibilityStatus({
        draggingDataType,
        portDataType: definition.dataType,
        canCoerce: definitionAsNodeInputDefinition.coerced ?? true,
        isInput: input,
      });

      if (status === 'none') {
        return '';
      }

      return status;
    }, [draggingDataType, definition.dataType, definitionAsNodeInputDefinition.coerced, input]);

    return (
      <div
        key={id}
        className={clsx(
          'port',
          {
            connected,
            closest,
          },
          accepted,
        )}
      >
        <div
          ref={ref}
          className={clsx('port-circle', { 'input-port': input, 'output-port': !input })}
          onMouseDown={(e) => {
            return onMouseDown?.(e, id, input);
          }}
          onMouseUp={(e) => onMouseUp?.(e, id)}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
          data-portid={id}
          data-porttype={input ? 'input' : 'output'}
          data-nodeid={nodeId}
        >
          {canDragTo && <div className={clsx('port-hover-area')} />}
        </div>
        {!hideLabel && (
          <div
            className={clsx('port-label', preservePortCase ? '' : 'port-label-uppercase')}
            onMouseDown={handleLabelMouseDown}
            onMouseOver={handleMouseOver}
            onMouseOut={handleMouseOut}
          >
            {title}
          </div>
        )}
      </div>
    );
  },
);

Port.displayName = 'Port';
