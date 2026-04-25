import Portal from '@atlaskit/portal';
import { css } from '@emotion/react';
import { type NodeId, type NodeInputDefinition, type NodeOutputDefinition, type PortId } from '@ironclad/rivet-core';
import { type CSSProperties, forwardRef, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { draggingWireState } from '../state/graphBuilder';
import { lastRunDataState, resolvedGraphSelectionState, selectedProcessPageState } from '../state/dataFlow';
import { getSelectedProcessData } from '../state/selectors/executionSelectors.js';
import clsx from 'clsx';
import { RenderDataValue } from './RenderDataValue';
import { getPortCompatibilityStatus } from '../domain/graphEditing/portCompatibility.js';
import { canvasIoDefinitionsForNodeState } from '../state/selectors/canvasGraphSelectors.js';

const style = css`
  position: absolute;

  padding: 12px;
  border-radius: 10px;
  corner-shape: squircle;
  background-color: var(--grey-darker);
  color: var(--foreground);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--grey);
  z-index: 1000;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  dl {
    display: grid;
    grid-template-columns: auto 2fr;
    flex-direction: column;
    margin: 0;
    padding: 0;
    align-items: center;
    column-gap: 16px;
    row-gap: 4px;

    dt {
      font-weight: bold;
      margin: 0;
      white-space: nowrap;
      padding: 0;
    }

    dd {
      margin: 0;
      padding: 0;
      min-width: 200px;
    }

    dt.id-title {
      grid-column: 1 / span 2;

      .id {
        font-family: var(--font-family-monospace);
        font-weight: 400;
        font-size: 12px;
      }
    }

    dd.description {
      grid-column: 1 / span 2;
    }
  }

  .will-be-coerced {
    color: var(--warning);

    code {
      font-family: var(--font-family-monospace);
      font-size: 12px;
    }
  }

  .incompatible {
    color: var(--error);

    code {
      font-family: var(--font-family-monospace);
      font-size: 12px;
    }
  }

  .not-ran {
    border-top: 1px dashed var(--warning);
    padding-top: 4px;
    margin-top: 4px;
    color: var(--warning);
  }
`;

export const PortInfo = forwardRef<
  HTMLDivElement,
  {
    port: {
      nodeId: NodeId;
      isInput: boolean;
      portId: PortId;
      definition: NodeInputDefinition | NodeOutputDefinition;
    };
    floatingStyles: CSSProperties;
  }
>(({ port, floatingStyles }, ref) => {
  const liveIo = useAtomValue(canvasIoDefinitionsForNodeState(port.nodeId));
  const definition = useMemo(
    () =>
      port.isInput
        ? liveIo.inputDefinitions.find((candidate) => candidate.id === port.portId)
        : liveIo.outputDefinitions.find((candidate) => candidate.id === port.portId),
    [liveIo.inputDefinitions, liveIo.outputDefinitions, port.isInput, port.portId],
  );

  if (!definition?.dataType) {
    return null;
  }

  return <PortInfoContent port={port} definition={definition} floatingStyles={floatingStyles} ref={ref} />;
});

PortInfo.displayName = 'PortInfo';

const PortInfoContent = forwardRef<
  HTMLDivElement,
  {
    port: {
      nodeId: NodeId;
      isInput: boolean;
      portId: PortId;
      definition: NodeInputDefinition | NodeOutputDefinition;
    };
    definition: NodeInputDefinition | NodeOutputDefinition;
    floatingStyles: CSSProperties;
  }
>(({ port, definition, floatingStyles }, ref) => {
  const { dataType, title, description, id } = definition;

  const lastRun = useAtomValue(lastRunDataState(port.nodeId));
  const selectedPage = useAtomValue(selectedProcessPageState(port.nodeId));
  const graphSelectionOptions = useAtomValue(resolvedGraphSelectionState);

  const portData = useMemo(() => {
    if (!lastRun || selectedPage == null) {
      return undefined;
    }

    const execution = getSelectedProcessData(lastRun, selectedPage, graphSelectionOptions);
    if (!execution?.data) {
      return undefined;
    }

    const data = port.isInput ? execution.data.inputData : execution.data.outputData;
    if (!data) {
      return undefined;
    }

    return data;
  }, [graphSelectionOptions, lastRun, port.isInput, selectedPage]);

  const didNotRun = portData?.[port.portId]?.type === 'control-flow-excluded';

  const draggingWire = useAtomValue(draggingWireState);

  const dataTypeDisplay: string =
    dataType == null ? 'Unknown' : Array.isArray(dataType) ? dataType.join(' or ') : (dataType as string);
  let dataTypeDisplayWithCoerced = dataTypeDisplay;

  let canCoerce = false;
  if (port.isInput && ((definition as NodeInputDefinition).coerced ?? true)) {
    canCoerce = true;
    dataTypeDisplayWithCoerced += ' (coerced)';
  }

  const compatibilityStatus = getPortCompatibilityStatus({
    draggingDataType: draggingWire?.dataType,
    portDataType: definition.dataType,
    canCoerce,
    isInput: port.isInput,
  });
  const willCoerce = compatibilityStatus === 'coerced';
  const incompatible = compatibilityStatus === 'incompatible';
  const draggingDataTypeDisplay =
    draggingWire?.dataType == null
      ? 'Unknown'
      : Array.isArray(draggingWire.dataType)
        ? draggingWire.dataType.join(' or ')
        : draggingWire.dataType;

  const displayExecutionNum = portData ? (selectedPage === 'latest' ? lastRun!.length : selectedPage + 1) : undefined;

  return (
    <Portal>
      <div css={style} ref={ref} style={floatingStyles} className={clsx({ 'has-data': !!portData })}>
        <dl>
          <dt className="id-title">
            {title === id ? (
              title
            ) : (
              <span>
                {title} <span className="id">({id})</span>
              </span>
            )}
          </dt>
          <dt>Data Type</dt>
          <dd>{dataTypeDisplayWithCoerced}</dd>

          {(definition as NodeInputDefinition).required && (
            <>
              <dt>Required</dt>
              <dd>Yes</dd>
            </>
          )}

          {description && (
            <>
              <dd className="description">{description}</dd>
            </>
          )}
        </dl>
        {willCoerce && (
          <div className="will-be-coerced">
            Your data of type <code>{draggingDataTypeDisplay}</code> will be coerced to <code>{dataTypeDisplay}</code>{' '}
            if you connect it here.
          </div>
        )}
        {incompatible && (
          <div className="incompatible">
            Your data of type <code>{draggingDataTypeDisplay}</code> is incompatible with <code>{dataTypeDisplay}</code>
            . You may still connect it, but your graph may error.
          </div>
        )}
        {didNotRun && port.isInput && (
          <div className="not-ran">The input to this port was not run in the last execution.</div>
        )}
        {didNotRun && !port.isInput && (
          <div className="not-ran">Nodes connected to this port were not run in the last execution.</div>
        )}
        {portData && (
          <>
            <h6>Execution {displayExecutionNum}</h6>
            <div className="last-value">
              <RenderDataValue truncateLength={1500} value={portData[port.portId]} mode="compact" />
            </div>
          </>
        )}
      </div>
    </Portal>
  );
});

PortInfoContent.displayName = 'PortInfoContent';
