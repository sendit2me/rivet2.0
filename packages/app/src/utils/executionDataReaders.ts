import { type DataType, type DataValue, type Outputs, type PortId, coerceTypeOptional, getWarnings } from '@ironclad/rivet-core';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { InputsOrOutputsWithRefs, NodeRunDataWithRefs } from '../state/dataFlow.js';
import { restoreStoredInputsOrOutputs, tryRestoreStoredDataValue } from './executionDataTransforms.js';
import { WarningsPort } from '../../../core/src/utils/symbols.js';

type RestoredSplitOutputs = {
  [index: number]: Outputs;
};

export type RestoredNodeOutputs = Outputs | RestoredSplitOutputs;

export function restoreStoredPortMap(
  data: InputsOrOutputsWithRefs | undefined,
  dataRefs: DataRefReader,
): Outputs | undefined {
  return restoreStoredInputsOrOutputs(data, dataRefs) as Outputs | undefined;
}

export function restoreStoredPortValue(
  outputs: InputsOrOutputsWithRefs | undefined,
  portId: PortId,
  dataRefs: DataRefReader,
): DataValue | undefined {
  return tryRestoreStoredDataValue(outputs?.[portId], dataRefs);
}

export function coerceStoredPortValue<T extends DataType>(
  outputs: InputsOrOutputsWithRefs | undefined,
  portId: PortId,
  dataType: T,
  dataRefs: DataRefReader,
): Extract<DataValue, { type: T }> | undefined {
  const restoredValue = restoreStoredPortValue(outputs, portId, dataRefs);
  const coercedValue = coerceTypeOptional(restoredValue, dataType);

  if (coercedValue === undefined) {
    return undefined;
  }

  return {
    type: dataType,
    value: coercedValue,
  } as Extract<DataValue, { type: T }>;
}

export function restoreDisplayedNodeOutputs(
  data: Pick<NodeRunDataWithRefs, 'outputData' | 'splitOutputData'>,
  dataRefs: DataRefReader,
): RestoredNodeOutputs | undefined {
  if (data.splitOutputData) {
    const restoredSplitOutputs = Object.fromEntries(
      Object.entries(data.splitOutputData)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([index, outputs]) => [Number(index), restoreStoredPortMap(outputs, dataRefs)!]),
    ) as RestoredSplitOutputs;

    return Object.keys(restoredSplitOutputs).length > 0 ? restoredSplitOutputs : undefined;
  }

  return restoreStoredPortMap(data.outputData, dataRefs);
}

export function getStoredWarningsForNodeOutput(
  data: Pick<NodeRunDataWithRefs, 'outputData' | 'splitOutputData'>,
  dataRefs: DataRefReader,
): string[] | undefined {
  const warnings = new Set<string>();

  collectWarningsFromOutputs(data.outputData, dataRefs, warnings);

  if (data.splitOutputData) {
    for (const outputs of Object.values(data.splitOutputData)) {
      collectWarningsFromOutputs(outputs, dataRefs, warnings);
    }
  }

  return warnings.size > 0 ? [...warnings] : undefined;
}

function collectWarningsFromOutputs(
  outputData: NodeRunDataWithRefs['outputData'],
  dataRefs: DataRefReader,
  warnings: Set<string>,
): void {
  const warningsValue = restoreStoredPortValue(outputData, WarningsPort as PortId, dataRefs);
  if (!warningsValue) {
    return;
  }

  const nextWarnings =
    coerceTypeOptional(warningsValue, 'string[]') ?? getWarnings({ [WarningsPort]: warningsValue });

  for (const warning of nextWarnings ?? []) {
    warnings.add(warning);
  }
}
