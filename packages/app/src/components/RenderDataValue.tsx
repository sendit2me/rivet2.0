import { type DataValue, type NodeOutputDefinition } from '@ironclad/rivet-core';
import { keys } from '../utils/typeSafety.js';
import { type FC } from 'react';
import { type DataRefReader, useDataRefs } from '../providers/ProvidersContext.js';
import { type DataValueWithRefs, type InputsOrOutputsWithRefs } from '../state/dataFlow.js';
import {
  isPreviewOnlyStoredValue,
  isStoredInlineDataValue,
  isStoredRefDataValue,
  tryRestoreStoredDataValue,
} from '../utils/executionDataTransforms.js';
import { createDataValueRendererMap } from './renderDataValue/createDataValueRendererMap.js';
import { createScalarRenderers } from './renderDataValue/createScalarRenderers.js';
import { LargeStoredValuePreview } from './renderDataValue/LargeStoredValuePreview.js';
import type { OutputRenderMode } from './renderDataValue/outputRenderTypes.js';

export type { OutputRenderMode } from './renderDataValue/outputRenderTypes.js';

let rendererMapSingleton: ReturnType<typeof createDataValueRendererMap> | undefined;

export function RenderDataValue({
  value,
  depth,
  renderMarkdown,
  truncateLength,
  isCompact,
  mode,
}: {
  value: DataValueWithRefs | DataValue | undefined;
  depth?: number;
  renderMarkdown?: boolean;
  truncateLength?: number;
  isCompact?: boolean;
  mode?: OutputRenderMode;
}) {
  const dataRefs = useDataRefs();
  const effectiveMode = mode ?? (isCompact ? 'compact' : 'full');
  const rendererMap = getRendererMap();

  if ((depth ?? 0) > 100) {
    return <>ERROR: FAILED TO RENDER {JSON.stringify(value)}</>;
  }

  if (!value) {
    return <>undefined</>;
  }

  if (isStoredRefDataValue(value) && isPreviewOnlyStoredValue(value)) {
    return <LargeStoredValuePreview value={value} mode={effectiveMode} />;
  }

  const resolvedValue = toRenderableDataValue(value, dataRefs);
  if (!resolvedValue) {
    return <div>Value no longer available in memory.</div>;
  }

  const Renderer = rendererMap[resolvedValue.type];

  return (
    <Renderer
      value={resolvedValue}
      depth={depth}
      renderMarkdown={renderMarkdown}
      truncateLength={truncateLength}
      isCompact={isCompact}
      mode={effectiveMode}
    />
  );
}

export const RenderDataOutputs: FC<{
  definitions?: NodeOutputDefinition[];
  outputs: InputsOrOutputsWithRefs;
  renderMarkdown?: boolean;
  isCompact: boolean;
  mode?: OutputRenderMode;
}> = ({ definitions, outputs, renderMarkdown, isCompact, mode }) => {
  let outputPorts = keys(outputs);
  const effectiveMode = mode ?? (isCompact ? 'compact' : 'full');

  if (outputPorts.length === 1) {
    return (
      <div>
        <RenderDataValue value={outputs[outputPorts[0]!]!} renderMarkdown={renderMarkdown} isCompact={isCompact} mode={effectiveMode} />
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
            <RenderDataValue value={outputs[portId]!} renderMarkdown={renderMarkdown} isCompact={isCompact} mode={effectiveMode} />
          </div>
        );
      })}
    </div>
  );
};

function getRendererMap(): ReturnType<typeof createDataValueRendererMap> {
  if (!rendererMapSingleton) {
    const renderValue = (nestedProps: {
      value: DataValue | undefined;
      depth?: number;
      renderMarkdown?: boolean;
      truncateLength?: number;
      isCompact?: boolean;
      mode?: OutputRenderMode;
    }) => <RenderDataValue {...nestedProps} />;

    const scalarRenderers = createScalarRenderers({
      renderValue,
    });

    rendererMapSingleton = createDataValueRendererMap({
      scalarRenderers,
      renderValue,
    });
  }

  return rendererMapSingleton;
}

function toRenderableDataValue(value: DataValueWithRefs | DataValue, dataRefs: DataRefReader): DataValue | undefined {
  if (isStoredInlineDataValue(value)) {
    return {
      type: value.type,
      value: value.value,
    } as DataValue;
  }

  if (isStoredRefDataValue(value)) {
    return tryRestoreStoredDataValue(value, dataRefs);
  }

  return value as DataValue;
}
