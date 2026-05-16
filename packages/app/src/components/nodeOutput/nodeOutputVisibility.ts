import type { ChartNode } from '@valerypopoff/rivet2-core';
import type { NodeRunDataWithRefs, PageValue, ProcessDataForNode } from '../../state/dataFlow.js';
import { getSelectedProcessData } from '../../state/selectors/executionSelectors.js';

export const NODE_OUTPUT_REPLACEMENT_GRACE_MS = 120;

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

export function nodeRunDataHasVisibleOutput(nodeType: ChartNode['type'], data: NodeRunDataWithRefs): boolean {
  return (
    shouldUseCodeErrorOutput(nodeType, data) ||
    data.status?.type === 'error' ||
    data.outputData != null ||
    data.splitOutputData != null
  );
}

export function getSelectedVisibleOutputProcess(
  nodeType: ChartNode['type'],
  processData: ProcessDataForNode[] | undefined,
  selectedPage: PageValue,
): ProcessDataForNode | undefined {
  const selectedProcess = getSelectedProcessData(processData, selectedPage);
  return selectedProcess && nodeRunDataHasVisibleOutput(nodeType, selectedProcess.data) ? selectedProcess : undefined;
}
