import type { ChartNode, NodeOutputDefinition } from '@valerypopoff/rivet2-core';
import type { DataRefReader } from '../../providers/ProvidersContext.js';
import type {
  InputsOrOutputsWithRefs,
  NodeRunDataWithRefs,
  PageValue,
  ProcessDataForNode,
} from '../../state/dataFlow.js';
import { getSelectedProcessData } from '../../state/selectors/executionSelectors.js';
import { getStoredOutputWarnings, restoreDisplayedNodeOutputs } from '../../utils/executionDataReaders.js';
import { hasVisibleStoredPortMapValues } from '../../utils/outputPortVisibility.js';
import {
  type NodeOutputCopyValueProjector,
  serializeDisplayedOutputs,
} from '../../utils/executionDataCopyValue.js';
import { getSortedRenderableSplitOutputEntries } from './splitOutputEntries.js';
import {
  getSelectedVisibleOutputProcess,
  nodeRunDataHasVisibleOutput,
  shouldUseCodeErrorOutput,
  shouldUseCustomNodeErrorOutput,
} from './nodeOutputVisibility.js';

export type NodeOutputCopySource = Pick<NodeRunDataWithRefs, 'outputData' | 'splitOutputData'>;

export type NodeOutputContentViewModel =
  | {
      kind: 'empty';
    }
  | {
      kind: 'code-error';
      contentKeyKind: 'code-error';
    }
  | {
      kind: 'generic-error';
      contentKeyKind: 'error';
      error: string;
    }
  | {
      kind: 'output' | 'custom-error';
      contentKeyKind: 'output' | 'custom-error';
      warnings: string[] | undefined;
      copySource: NodeOutputCopySource;
    };

export type NodeOutputBodyViewModel =
  | {
      kind: 'custom-fullscreen-renderer';
    }
  | {
      kind: 'custom-renderer';
    }
  | {
      kind: 'split-outputs';
      splitOutputs: Array<[string, InputsOrOutputsWithRefs]>;
    }
  | {
      kind: 'outputs';
      outputs: InputsOrOutputsWithRefs;
    }
  | {
      kind: 'empty';
    };

export type FullscreenNodeOutputViewModel =
  | {
      kind: 'empty';
      processId: undefined;
      data: undefined;
      content: { kind: 'empty' };
      totalPages: number;
    }
  | {
      kind: 'content';
      processId: ProcessDataForNode['processId'];
      data: NodeRunDataWithRefs;
      content: Exclude<NodeOutputContentViewModel, { kind: 'empty' }>;
      totalPages: number;
    };

export function createNodeOutputContentViewModel(options: {
  nodeType: ChartNode['type'];
  data: NodeRunDataWithRefs;
  dataRefs: DataRefReader;
}): NodeOutputContentViewModel {
  const { nodeType, data, dataRefs } = options;
  const shouldUseCustomErrorOutput = shouldUseCustomNodeErrorOutput(nodeType, data);

  if (shouldUseCodeErrorOutput(nodeType, data)) {
    return {
      kind: 'code-error',
      contentKeyKind: 'code-error',
    };
  }

  if (data.status?.type === 'error' && !shouldUseCustomErrorOutput) {
    return {
      kind: 'generic-error',
      contentKeyKind: 'error',
      error: data.status.error,
    };
  }

  if (!nodeRunDataHasVisibleOutput(nodeType, data)) {
    return {
      kind: 'empty',
    };
  }

  return {
    kind: shouldUseCustomErrorOutput ? 'custom-error' : 'output',
    contentKeyKind: shouldUseCustomErrorOutput ? 'custom-error' : 'output',
    warnings: getStoredOutputWarnings(data, dataRefs),
    copySource: data,
  };
}

export function createNodeOutputBodyViewModel(options: {
  data: NodeRunDataWithRefs;
  hasFullscreenOutputRenderer?: boolean;
  hasOutputRenderer?: boolean;
}): NodeOutputBodyViewModel {
  const { data, hasFullscreenOutputRenderer = false, hasOutputRenderer = false } = options;

  if (hasFullscreenOutputRenderer) {
    return { kind: 'custom-fullscreen-renderer' };
  }

  if (hasOutputRenderer) {
    return { kind: 'custom-renderer' };
  }

  const splitOutputs = getSortedRenderableSplitOutputEntries(data.splitOutputData);
  if (splitOutputs.length > 0) {
    return {
      kind: 'split-outputs',
      splitOutputs,
    };
  }

  if (hasVisibleStoredPortMapValues(data.outputData)) {
    return {
      kind: 'outputs',
      outputs: data.outputData,
    };
  }

  return { kind: 'empty' };
}

export function createFullscreenNodeOutputViewModel(options: {
  nodeType: ChartNode['type'];
  processData: ProcessDataForNode[] | undefined;
  selectedPage: PageValue;
  dataRefs: DataRefReader;
}): FullscreenNodeOutputViewModel {
  const { nodeType, processData, selectedPage, dataRefs } = options;
  const selectedProcess = getSelectedVisibleOutputProcess(nodeType, processData, selectedPage);
  const content =
    selectedProcess &&
    createNodeOutputContentViewModel({
      nodeType,
      data: selectedProcess.data,
      dataRefs,
    });

  if (!selectedProcess || !content || content.kind === 'empty') {
    return {
      kind: 'empty',
      processId: undefined,
      data: undefined,
      content: { kind: 'empty' },
      totalPages: processData?.length ?? 0,
    };
  }

  return {
    kind: 'content',
    processId: selectedProcess.processId,
    data: selectedProcess.data,
    content,
    totalPages: processData?.length ?? 0,
  };
}

export function getSelectedNodeOutputProcess(
  processData: ProcessDataForNode[],
  selectedPage: PageValue,
): ProcessDataForNode | undefined {
  return getSelectedProcessData(processData, selectedPage);
}

export function getNodeOutputCopySource(content: NodeOutputContentViewModel): NodeOutputCopySource | undefined {
  return content.kind === 'output' || content.kind === 'custom-error' ? content.copySource : undefined;
}

export function serializeNodeOutputDisplayCopy(
  copySource: NodeOutputCopySource | undefined,
  dataRefs: DataRefReader,
  options?: {
    getCopyValueData?: NodeOutputCopyValueProjector;
    outputDefinitions?: readonly Pick<NodeOutputDefinition, 'id' | 'title'>[];
  },
): string | undefined {
  if (!copySource) {
    return undefined;
  }

  return serializeDisplayedOutputs(copySource, dataRefs, options);
}

export function serializeNodeOutputJsonCopy(
  copySource: NodeOutputCopySource | undefined,
  dataRefs: DataRefReader,
): string | undefined {
  if (!copySource) {
    return undefined;
  }

  const restoredOutputData = restoreDisplayedNodeOutputs(copySource, dataRefs);
  if (!restoredOutputData) {
    return undefined;
  }

  return JSON.stringify(restoredOutputData, null, 2);
}
