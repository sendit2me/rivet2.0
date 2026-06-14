import { css } from '@emotion/react';
import { type ChangeEvent, type FC, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { projectState } from '../../state/savedGraphs.js';
import { type GraphId, type PortId, type SubGraphNode } from '@valerypopoff/rivet2-core';
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
import { useEditNodeCommand } from '../../commands/editNodeCommand.js';
import { getProjectGraphSelectorOptions } from '../../utils/graphSelectorOptions.js';

const subGraphBodyCss = css`
  color: var(--foreground-bright);
  font-family: var(--font-family-monospace);
  font-size: var(--ui-font-size-sm);
  line-height: 1.2;
  max-width: 100%;
  min-width: 0;
  user-select: none;

  .subgraph-node-body-select-wrap {
    align-items: center;
    color: var(--foreground-bright);
    display: flex;
    max-width: 100%;
    min-width: 0;
    position: relative;
    width: 100%;
  }

  .subgraph-node-body-select-wrap::after {
    border-left: calc(4px * var(--ui-font-scale, 1)) solid transparent;
    border-right: calc(4px * var(--ui-font-scale, 1)) solid transparent;
    border-top: calc(5px * var(--ui-font-scale, 1)) solid currentColor;
    content: '';
    pointer-events: none;
    position: absolute;
    right: calc(8px * var(--ui-font-scale, 1));
  }

  .subgraph-node-body-select {
    appearance: none;
    background: color-mix(in srgb, var(--grey-darkish) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--foreground-bright) 18%, transparent);
    border-radius: calc(5px * var(--ui-font-scale, 1));
    color: var(--foreground-bright);
    cursor: pointer;
    font: inherit;
    height: calc(26px * var(--ui-font-scale, 1));
    line-height: 1;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    padding: 0 calc(24px * var(--ui-font-scale, 1)) 0 calc(8px * var(--ui-font-scale, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  .subgraph-node-body-select:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .subgraph-node-body-select:focus-visible {
    border-color: var(--primary);
    outline: none;
  }

  .subgraph-node-body-select option {
    background: var(--grey-dark);
    color: var(--foreground-bright);
  }
`;

const subGraphOutputCss = css`
  .metaInfo.with-body {
    margin-bottom: 8px;
  }
`;

export const SubGraphNodeBody: FC<{
  node: SubGraphNode;
}> = ({ node }) => {
  const project = useAtomValue(projectState);
  const editNode = useEditNodeCommand();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [isSelectFocused, setIsSelectFocused] = useState(false);
  const graphOptions = useMemo(
    () =>
      getProjectGraphSelectorOptions(project.graphs, {
        includeMissingSelectedGraph: true,
        selectedGraphId: node.data.graphId,
      }),
    [node.data.graphId, project.graphs],
  );
  const selectValue = graphOptions.some((option) => option.value === node.data.graphId) ? node.data.graphId : '';

  useEffect(() => {
    if (!isSelectFocused) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const selectElement = selectRef.current;

      if (!selectElement || document.activeElement !== selectElement || !(event.target instanceof Node)) {
        return;
      }

      const nodeElement = rootRef.current?.closest<HTMLElement>('.node');

      if (nodeElement?.contains(event.target)) {
        return;
      }

      selectElement.blur();
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, [isSelectFocused]);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const graphId = event.target.value as GraphId;

    if (!graphId || graphId === node.data.graphId) {
      return;
    }

    editNode({
      nodeId: node.id,
      newNode: {
        data: {
          ...node.data,
          graphId,
        },
      },
    });
  };

  const handleSelectDoubleClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
  };

  return (
    <div ref={rootRef} css={subGraphBodyCss}>
      <span className="subgraph-node-body-select-wrap" onDoubleClick={handleSelectDoubleClick}>
        <select
          ref={selectRef}
          aria-label="Subgraph graph"
          className="subgraph-node-body-select"
          disabled={graphOptions.length === 0}
          onBlur={() => setIsSelectFocused(false)}
          onChange={handleChange}
          onFocus={() => setIsSelectFocused(true)}
          value={selectValue}
        >
          <option value="" disabled>
            {graphOptions.length === 0 ? 'No graphs' : 'Select graph...'}
          </option>
          {graphOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
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
