import { type FC } from 'react';
import { type NodeOutputDefinition } from '@ironclad/rivet-core';
import { keys } from '../../../core/src/utils/typeSafety';
import { type InputsOrOutputsWithRefs, type DataValueWithRefs } from '../state/dataFlow';
import { getDefaultProviders } from '../providers/ProvidersContext';
import { createScalarRenderers } from './renderDataValue/createScalarRenderers.js';
import { createDataValueRendererMap } from './renderDataValue/createDataValueRendererMap.js';

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
  const rendererMap = createDataValueRendererMap({
    scalarRenderers,
    renderValue: ({ value, depth, renderMarkdown, truncateLength, isCompact }) => (
      <RenderDataValue
        value={value}
        depth={depth}
        renderMarkdown={renderMarkdown}
        truncateLength={truncateLength}
        isCompact={isCompact}
      />
    ),
  });

  if ((depth ?? 0) > 100) {
    return <>ERROR: FAILED TO RENDER {JSON.stringify(value)}</>;
  }
  if (!value) {
    return <>undefined</>;
  }

  const Renderer = rendererMap[value.type];

  return <Renderer value={value} depth={depth} renderMarkdown={renderMarkdown} truncateLength={truncateLength} isCompact={isCompact} />;
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
