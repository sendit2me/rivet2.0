import { WarningsPort, type ChartNode, type PortId } from '@valerypopoff/rivet2-core';
import type { NodeRunDataWithRefs, PageValue, ProcessDataForNode } from '../../state/dataFlow.js';
import { getSelectedProcessData } from '../../state/selectors/executionSelectors.js';
import { hasVisibleStoredPortMapValues, hasVisibleStoredSplitOutputValues } from '../../utils/outputPortVisibility.js';

export const NODE_OUTPUT_REPLACEMENT_GRACE_MS = 120;

export type NodeRunDurationVisibilityOptions = {
  showNodeRunDuration?: boolean;
};

export function shouldUseCustomNodeErrorOutput(nodeType: ChartNode['type'], data: NodeRunDataWithRefs): boolean {
  return (
    (nodeType === 'expression' ||
      nodeType === 'codeNew' ||
      nodeType === 'jsFilter' ||
      nodeType === 'jsMap' ||
      nodeType === 'extractObjectPath') &&
    data.status?.type === 'error'
  );
}

export function shouldUseCodeErrorOutput(nodeType: ChartNode['type'], data: NodeRunDataWithRefs): boolean {
  return nodeType === 'code' && data.status?.type === 'error';
}

export function nodeRunDataHasVisibleOutput(
  nodeType: ChartNode['type'],
  data: NodeRunDataWithRefs,
  options: NodeRunDurationVisibilityOptions = {},
): boolean {
  return (
    shouldUseCodeErrorOutput(nodeType, data) ||
    data.status?.type === 'error' ||
    hasVisibleStoredPortMapValues(data.outputData) ||
    hasVisibleStoredSplitOutputValues(data.splitOutputData) ||
    hasStoredOutputWarnings(data) ||
    (options.showNodeRunDuration === true &&
      (hasVisibleNodeRunDuration(data) || hasVisibleSplitRunDuration(data)) &&
      !nodeTypeHasOwnDurationOutput(nodeType))
  );
}

export function getSelectedVisibleOutputProcess(
  nodeType: ChartNode['type'],
  processData: ProcessDataForNode[] | undefined,
  selectedPage: PageValue,
  options: NodeRunDurationVisibilityOptions = {},
): ProcessDataForNode | undefined {
  const selectedProcess = getSelectedProcessData(processData, selectedPage);
  return selectedProcess && nodeRunDataHasVisibleOutput(nodeType, selectedProcess.data, options)
    ? selectedProcess
    : undefined;
}

export function hasNodeRunDuration(data: NodeRunDataWithRefs): boolean {
  return typeof data.durationMs === 'number' && Number.isFinite(data.durationMs);
}

export function hasVisibleNodeRunDuration(data: NodeRunDataWithRefs): boolean {
  return hasNodeRunDuration(data) && data.status?.type !== 'running' && data.status?.type !== 'notRan';
}

export function hasVisibleSplitRunDuration(data: NodeRunDataWithRefs): boolean {
  return (
    data.status?.type !== 'running' &&
    data.status?.type !== 'notRan' &&
    Object.values(data.splitRunDurationMs ?? {}).some((durationMs) => Number.isFinite(durationMs))
  );
}

export function nodeTypeHasOwnDurationOutput(nodeType: ChartNode['type']): boolean {
  return nodeType === 'subGraph' || nodeType === 'callGraph' || nodeType === 'referencedGraphAlias' || nodeType === 'chat';
}

function hasStoredOutputWarnings(data: NodeRunDataWithRefs): boolean {
  if (data.outputData?.[WarningsPort as PortId] != null) {
    return true;
  }

  return Object.values(data.splitOutputData ?? {}).some((outputs) => outputs?.[WarningsPort as PortId] != null);
}
