import { css } from '@emotion/react';
import { type FC } from 'react';
import { useAtomValue } from 'jotai';
import { projectState } from '../../state/savedGraphs.js';
import { type PortId, type SubGraphNode } from '@valerypopoff/rivet2-core';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import { RenderDataOutputs, type OutputRenderMode } from '../RenderDataValue.js';
import { omit } from 'lodash-es';
import { type InputsOrOutputsWithRefs } from '../../state/dataFlow';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { tryRestoreStoredDataValue } from '../../utils/executionDataStorage.js';
import { getSubGraphNodeCopyValueData } from '../../utils/nodeOutputCopyValueProjectors.js';
import {
  formatSubGraphCost,
  formatSubGraphDurationMs,
  getSubGraphCostMetric,
  getSubGraphDurationMetric,
  type SubGraphNumberMetric,
} from '../../utils/subGraphOutputMetrics.js';
import { hasVisibleStoredPortMapValues } from '../../utils/outputPortVisibility.js';

const subGraphOutputCss = css`
  .metaInfo.with-body {
    margin-bottom: 8px;
  }
`;

export const SubGraphNodeBody: FC<{
  node: SubGraphNode;
}> = ({ node }) => {
  const project = useAtomValue(projectState);
  const selectedGraph = project.graphs[node.data.graphId];
  const selectedGraphName = selectedGraph?.metadata?.name ?? node.data.graphId;

  return (
    <div>
      <div>{selectedGraphName}</div>
    </div>
  );
};

export const SubGraphNodeOutputSimple: FC<{
  outputs: InputsOrOutputsWithRefs;
  renderMarkdown?: boolean;
  isCompact: boolean;
  renderMode?: OutputRenderMode;
  allowLargeStoredValueActions?: boolean;
}> = ({ outputs, renderMarkdown, isCompact, renderMode, allowLargeStoredValueActions }) => {
  const dataRefs = useDataRefs();
  const costMetric = getSubGraphCostMetric(tryRestoreStoredDataValue(outputs['cost' as PortId], dataRefs));
  const durationMetric = getSubGraphDurationMetric(
    tryRestoreStoredDataValue(outputs['duration' as PortId], dataRefs),
  );
  const bodyOutputs = omit(outputs, ['cost', 'duration'])! as InputsOrOutputsWithRefs;
  const hasMeta = costMetric.kind !== 'none' || durationMetric.kind !== 'none';
  const hasBody = hasVisibleStoredPortMapValues(bodyOutputs);

  return (
    <div css={subGraphOutputCss}>
      {hasMeta && (
        <div className={hasBody ? 'metaInfo with-body' : 'metaInfo'}>
          <SubGraphNumberMetricMeta
            metric={costMetric}
            label="Cost"
            totalLabel="Total cost"
            formatValue={formatSubGraphCost}
          />
          <SubGraphNumberMetricMeta
            metric={durationMetric}
            label="Duration"
            totalLabel="Total duration"
            formatValue={formatSubGraphDurationMs}
          />
        </div>
      )}
      {hasBody && (
        <div>
          <RenderDataOutputs
            outputs={bodyOutputs}
            renderMarkdown={renderMarkdown}
            isCompact={isCompact}
            mode={renderMode}
            allowLargeStoredValueActions={allowLargeStoredValueActions}
          />
        </div>
      )}
    </div>
  );
};

const SubGraphNumberMetricMeta: FC<{
  metric: SubGraphNumberMetric;
  label: string;
  totalLabel: string;
  formatValue(value: number): string;
}> = ({ metric, label, totalLabel, formatValue }) => {
  if (metric.kind === 'none') {
    return null;
  }

  if (metric.kind === 'single') {
    return (
      <div>
        <em>
          {label}: {formatValue(metric.value)}
        </em>
      </div>
    );
  }

  return (
    <div>
      <div>
        <em>
          {totalLabel}: {formatValue(metric.totalValue)}
        </em>
      </div>
      {metric.runValues.map((value, index) => (
        <div key={index}>
          <em>
            Run {index + 1}: {formatValue(value)}
          </em>
        </div>
      ))}
    </div>
  );
};

export const FullscreenSubGraphNodeOutputSimple: FC<{
  outputs: InputsOrOutputsWithRefs;
  renderMarkdown: boolean;
  renderMode?: OutputRenderMode;
  allowLargeStoredValueActions?: boolean;
}> = ({ outputs, renderMarkdown, renderMode, allowLargeStoredValueActions }) => {
  return (
    <SubGraphNodeOutputSimple
      outputs={outputs}
      renderMarkdown={renderMarkdown}
      isCompact={false}
      renderMode={renderMode}
      allowLargeStoredValueActions={allowLargeStoredValueActions}
    />
  );
};

export const subgraphNodeDescriptor: NodeComponentDescriptor<'subGraph'> = {
  Body: SubGraphNodeBody,
  OutputSimple: SubGraphNodeOutputSimple,
  FullscreenOutputSimple: FullscreenSubGraphNodeOutputSimple,
  getCopyValueData: getSubGraphNodeCopyValueData,
};
