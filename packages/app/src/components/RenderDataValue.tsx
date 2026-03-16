import { useMemo, type FC } from 'react';
import {
  type DataValue,
  type ScalarDataType,
  arrayizeDataValue,
  getScalarTypeOf,
  inferType,
  isFunctionDataValue,
  type NodeOutputDefinition,
  type DataType,
  isArrayDataType,
  type ScalarOrArrayDataValue,
} from '@ironclad/rivet-core';
import { keys } from '../../../core/src/utils/typeSafety';
import clsx from 'clsx';
import { type InputsOrOutputsWithRefs, type DataValueWithRefs, type ScalarDataValueWithRefs } from '../state/dataFlow';
import { getDefaultProviders } from '../providers/ProvidersContext';
import { createScalarRenderers, type ScalarRendererProps } from './renderDataValue/createScalarRenderers.js';
import { multiOutputStyles, renderDataValueStyles } from './renderDataValue/renderDataValueStyles.js';

const dataRefs = getDefaultProviders().dataRefs;

export const RenderDataValue: FC<{
  value: DataValueWithRefs | undefined;
  depth?: number;
  renderMarkdown?: boolean;
  truncateLength?: number;
  isCompact?: boolean;
}> = ({ value, depth, renderMarkdown, truncateLength, isCompact }) => {
  const scalarRenderers = createScalarRenderers({
    dataRefs,
    renderValue: (nestedValue, nestedDepth, nestedRenderMarkdown, nestedTruncateLength, nestedIsCompact) => (
      <RenderDataValue
        value={nestedValue}
        depth={nestedDepth}
        renderMarkdown={nestedRenderMarkdown}
        truncateLength={nestedTruncateLength}
        isCompact={nestedIsCompact}
      />
    ),
  });

  if ((depth ?? 0) > 100) {
    return <>ERROR: FAILED TO RENDER {JSON.stringify(value)}</>;
  }
  if (!value) {
    return <>undefined</>;
  }

  if (isArrayDataType(value.type)) {
    let items = arrayizeDataValue(value as ScalarOrArrayDataValue);

    const count = items.length;

    if (isCompact) {
      items = items.slice(0, 1);
    }

    return (
      <div
        css={multiOutputStyles}
        className={clsx({
          'chat-message-list': value.type === 'chat-message[]',
        })}
      >
        <div className="array-info">
          ({count.toLocaleString()} element{count === 1 ? '' : 's'})
        </div>
        {items.map((v, i) => (
          <div className="multi-output-item" key={i}>
            <RenderDataValue
              key={i}
              value={v as DataValueWithRefs}
              depth={(depth ?? 0) + 1}
              renderMarkdown={renderMarkdown}
              truncateLength={truncateLength}
              isCompact={isCompact}
            />
          </div>
        ))}
      </div>
    );
  }

  if (isFunctionDataValue(value as DataValue)) {
    const type = getScalarTypeOf(value.type);
    return (
      <div>
        <em>Function{`<${type}>`}</em>
      </div>
    );
  }

  const Renderer = scalarRenderers[value.type as ScalarDataType] as FC<ScalarRendererProps>;

  if (!Renderer) {
    return <div>ERROR: UNKNOWN TYPE: {JSON.stringify(value)}</div>;
  }

  return (
    <div css={renderDataValueStyles}>
      <Renderer
        value={value as ScalarDataValueWithRefs}
        depth={(depth ?? 0) + 1}
        renderMarkdown={renderMarkdown}
        truncateLength={truncateLength}
        isCompact={isCompact}
      />
    </div>
  );
};

export const RenderDataOutputs: FC<{
  definitions?: NodeOutputDefinition[];
  outputs: InputsOrOutputsWithRefs;
  renderMarkdown?: boolean;
  isCompact: boolean;
}> = ({ definitions, outputs, renderMarkdown, isCompact }) => {
  let outputPorts = keys(outputs);

  if (outputPorts.length === 1) {
    return (
      <div>
        <RenderDataValue value={outputs[outputPorts[0]!]!} renderMarkdown={renderMarkdown} isCompact={isCompact} />
      </div>
    );
  }

  if (isCompact) {
    outputPorts = outputPorts.slice(0, 1);
  }

  return (
    <div className="rendered-data-outputs">
      {outputPorts.map((portId) => {
        const def = definitions?.find((d) => d.id === portId);
        const label = def?.title ?? portId;

        return (
          <div className="port-value" key={portId}>
            <div>
              <em className="port-id-label">{label}</em>
            </div>
            <RenderDataValue value={outputs![portId]!} renderMarkdown={renderMarkdown} isCompact={isCompact} />
          </div>
        );
      })}
    </div>
  );
};
