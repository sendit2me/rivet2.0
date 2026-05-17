import { WarningsPort, type ChartNode, type PortId } from '@valerypopoff/rivet2-core';
import type { NodeRunDataWithRefs, PageValue, ProcessDataForNode } from '../../state/dataFlow.js';
import { getSelectedProcessData } from '../../state/selectors/executionSelectors.js';
import { hasVisibleStoredPortMapValues, hasVisibleStoredSplitOutputValues } from '../../utils/outputPortVisibility.js';

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
    hasVisibleStoredPortMapValues(data.outputData) ||
    hasVisibleStoredSplitOutputValues(data.splitOutputData) ||
    hasStoredOutputWarnings(data)
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

function hasStoredOutputWarnings(data: NodeRunDataWithRefs): boolean {
  if (data.outputData?.[WarningsPort as PortId] != null) {
    return true;
  }

  return Object.values(data.splitOutputData ?? {}).some((outputs) => outputs?.[WarningsPort as PortId] != null);
}
