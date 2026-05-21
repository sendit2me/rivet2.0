import { css } from '@emotion/react';
import type { ChartNode } from '@valerypopoff/rivet2-core';
import type { FC } from 'react';
import type { NodeRunDataWithRefs, ProcessDataForNode } from '../../state/dataFlow.js';
import {
  hasVisibleNodeRunDuration,
  hasVisibleSplitRunDuration,
  nodeTypeHasOwnDurationOutput,
} from './nodeOutputVisibility.js';

const nodeRunDurationMetaCss = css`
  color: var(--foreground-bright);
  font-size: var(--ui-font-size-sm);
  line-height: 1.4;

  &.with-body {
    margin-bottom: 8px;
  }

  .duration-line + .duration-line {
    margin-top: 2px;
  }
`;

export type NodeRunDurationEntry = {
  runIndex: number;
  durationMs: number;
};

export function getNodeRunDurationMs(data: NodeRunDataWithRefs): number | undefined {
  return hasVisibleNodeRunDuration(data) ? data.durationMs : undefined;
}

function getSplitRunDurationEntries(data: NodeRunDataWithRefs): NodeRunDurationEntry[] {
  if (!hasVisibleSplitRunDuration(data)) {
    return [];
  }

  return Object.entries(data.splitRunDurationMs ?? {})
    .map(([index, durationMs]) => ({ runIndex: Number(index) + 1, durationMs }))
    .filter(
      (entry): entry is NodeRunDurationEntry =>
        Number.isInteger(entry.runIndex) && entry.runIndex >= 1 && Number.isFinite(entry.durationMs),
    )
    .sort((left, right) => left.runIndex - right.runIndex);
}

export function getNodeRunDurationEntries(
  processData: readonly ProcessDataForNode[] | undefined,
): NodeRunDurationEntry[] {
  let nextRunIndex = 1;
  const entries: NodeRunDurationEntry[] = [];

  for (const process of processData ?? []) {
    const splitEntries = getSplitRunDurationEntries(process.data);
    if (splitEntries.length > 0) {
      entries.push(...splitEntries.map((entry) => ({ ...entry, runIndex: nextRunIndex++ })));
      continue;
    }

    const durationMs = getNodeRunDurationMs(process.data);
    if (durationMs !== undefined) {
      entries.push({ runIndex: nextRunIndex++, durationMs });
    }
  }

  return entries;
}

export function getTotalNodeRunDurationMs(
  processData: readonly ProcessDataForNode[] | undefined,
): number | undefined {
  return getTotalNodeRunDurationEntryMs(getNodeRunDurationEntries(processData));
}

export function shouldShowNodeRunDurationMeta(
  nodeType: ChartNode['type'],
  data: NodeRunDataWithRefs,
  showNodeRunDuration: boolean,
): boolean {
  return (
    showNodeRunDuration &&
    !nodeTypeHasOwnDurationOutput(nodeType) &&
    getSplitRunDurationEntries(data).length <= 1 &&
    getNodeRunDurationMs(data) !== undefined
  );
}

export function shouldShowNodeRunDurationSummary(
  nodeType: ChartNode['type'],
  processData: readonly ProcessDataForNode[] | undefined,
  showNodeRunDuration: boolean,
): boolean {
  return (
    showNodeRunDuration &&
    !nodeTypeHasOwnDurationOutput(nodeType) &&
    getNodeRunDurationEntries(processData).length > 1
  );
}

export const NodeRunDurationMeta: FC<{
  data: NodeRunDataWithRefs;
  hasBody?: boolean;
}> = ({ data, hasBody = false }) => {
  const durationMs = getNodeRunDurationMs(data);
  if (durationMs === undefined) {
    return null;
  }

  return (
    <div css={nodeRunDurationMetaCss} className={hasBody ? 'with-body' : undefined}>
      <em>Duration: {Math.round(durationMs)}ms</em>
    </div>
  );
};

export const NodeRunDurationSummaryMeta: FC<{
  processData: readonly ProcessDataForNode[];
  hasBody?: boolean;
}> = ({ processData, hasBody = false }) => {
  const entries = getNodeRunDurationEntries(processData);
  const totalDurationMs = getTotalNodeRunDurationEntryMs(entries);
  if (entries.length <= 1 || totalDurationMs === undefined) {
    return null;
  }

  return (
    <div css={nodeRunDurationMetaCss} className={hasBody ? 'with-body' : undefined}>
      <div className="duration-line">
        <em>Total duration: {Math.round(totalDurationMs)}ms</em>
      </div>
      {entries.map((entry) => (
        <div className="duration-line" key={entry.runIndex}>
          <em>
            Run {entry.runIndex}: {Math.round(entry.durationMs)}ms
          </em>
        </div>
      ))}
    </div>
  );
};

function getTotalNodeRunDurationEntryMs(entries: readonly NodeRunDurationEntry[]): number | undefined {
  return entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.durationMs, 0) : undefined;
}
