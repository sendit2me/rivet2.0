import { css } from '@emotion/react';
import type { ChartNode, ProcessId } from '@valerypopoff/rivet2-core';
import type { FC, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { DataRefReader } from '../../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs, PageValue, ProcessDataForNode } from '../../state/dataFlow.js';
import { hasUnavailableStoredRefs } from '../../utils/executionDataTransforms.js';
import { getSelectedVisibleOutputProcess, NODE_OUTPUT_REPLACEMENT_GRACE_MS } from './nodeOutputVisibility.js';

export function getNodeOutputContentKey(processId: ProcessId, data: NodeRunDataWithRefs, contentKind: string): string {
  return `${processId}:${data.startedAt ?? 'unknown-start'}:${contentKind}`;
}

const MAX_SEEN_NODE_OUTPUT_CONTENT_KEYS = 500;
const seenNodeOutputContentKeys = new Set<string>();

function rememberNodeOutputContentKey(contentKey: string): void {
  if (seenNodeOutputContentKeys.has(contentKey)) {
    return;
  }

  seenNodeOutputContentKeys.add(contentKey);

  if (seenNodeOutputContentKeys.size <= MAX_SEEN_NODE_OUTPUT_CONTENT_KEYS) {
    return;
  }

  const oldestKey = seenNodeOutputContentKeys.values().next().value;
  if (oldestKey) {
    seenNodeOutputContentKeys.delete(oldestKey);
  }
}

const nodeOutputContentFadeCss = css`
  &.animate-node-output-content {
    animation: node-output-content-fade-in 140ms ease-out both;
  }

  @keyframes node-output-content-fade-in {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    &.animate-node-output-content {
      animation: none;
    }
  }
`;

export const NodeOutputContentFade: FC<{ children: ReactNode; contentKey: string }> = ({ children, contentKey }) => {
  const shouldAnimateRef = useRef(!seenNodeOutputContentKeys.has(contentKey));
  const className = shouldAnimateRef.current
    ? 'node-output-content-fade animate-node-output-content'
    : 'node-output-content-fade';

  useEffect(() => {
    rememberNodeOutputContentKey(contentKey);
  }, [contentKey]);

  return (
    <div css={nodeOutputContentFadeCss} className={className}>
      {children}
    </div>
  );
};

NodeOutputContentFade.displayName = 'NodeOutputContentFade';

export function useOutputDataWithReplacementGrace(
  nodeType: ChartNode['type'],
  output: ProcessDataForNode[] | undefined,
  selectedPage: PageValue,
  dataRefs: DataRefReader,
): ProcessDataForNode[] | undefined {
  const [displayedOutput, setDisplayedOutput] = useState(output);
  const hasSelectedVisibleOutput = getSelectedVisibleOutputProcess(nodeType, output, selectedPage) != null;
  const displayedVisibleOutput = getSelectedVisibleOutputProcess(nodeType, displayedOutput, selectedPage);
  const hasDisplayedAvailableOutput =
    displayedVisibleOutput != null && !hasUnavailableStoredRefs(displayedVisibleOutput.data, dataRefs);

  useEffect(() => {
    if (hasSelectedVisibleOutput) {
      setDisplayedOutput(output);
      return;
    }

    if (!hasDisplayedAvailableOutput) {
      setDisplayedOutput(undefined);
      return;
    }

    const timeout = globalThis.setTimeout(() => {
      setDisplayedOutput(undefined);
    }, NODE_OUTPUT_REPLACEMENT_GRACE_MS);

    return () => {
      globalThis.clearTimeout(timeout);
    };
  }, [hasDisplayedAvailableOutput, hasSelectedVisibleOutput, output]);

  return hasSelectedVisibleOutput ? output : hasDisplayedAvailableOutput ? displayedOutput : undefined;
}
