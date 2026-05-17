import { type NodeOutputDefinition, type PortId, WarningsPort } from '@valerypopoff/rivet2-core';
import type { DataRefReader } from '../../providers/ProvidersContext.js';
import type { InputsOrOutputsWithRefs, NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { restoreStoredPortValue } from '../executionDataReaders.js';
import { isStoredRefDataValue } from '../executionDataStorage.js';
import { displayCopySections, isDisplayCopySections } from './displayCopySections.js';
import { projectDataValue } from './projectDataValue.js';

export type NodeOutputCopyValueProjectorArgs = {
  outputs: InputsOrOutputsWithRefs;
  dataRefs: DataRefReader;
};

export type NodeOutputCopyValueProjector = (args: NodeOutputCopyValueProjectorArgs) => unknown | undefined;

const MISSING_STORED_VALUE_TEXT = 'Value no longer available in memory.';

export function serializeDisplayedOutputs(
  data: Pick<NodeRunDataWithRefs, 'outputData' | 'splitOutputData'>,
  dataRefs: DataRefReader,
  options?: {
    getCopyValueData?: NodeOutputCopyValueProjector;
    outputDefinitions?: readonly Pick<NodeOutputDefinition, 'id' | 'title'>[];
  },
): string | undefined {
  const { getCopyValueData, outputDefinitions } = options ?? {};

  if (!getCopyValueData) {
    return serializeGenericDisplayedOutputs(data, dataRefs, outputDefinitions);
  }

  if (data.splitOutputData) {
    const serializedSplits = Object.entries(data.splitOutputData)
      .sort(([left], [right]) => Number(left) - Number(right))
      .flatMap(([, outputs]) => {
        const projectedValue = getCopyValueData({ outputs, dataRefs });
        return projectedValue === undefined ? [] : [serializeProjectedCopyValue(projectedValue)];
      });

    return serializedSplits.length > 0 ? serializedSplits.join('\n\n') : undefined;
  }

  const projectedOutputs = data.outputData ? getCopyValueData({ outputs: data.outputData, dataRefs }) : undefined;
  if (projectedOutputs === undefined) {
    return undefined;
  }

  return serializeProjectedCopyValue(projectedOutputs);
}

export function isVisiblePort(portId: PortId | string): boolean {
  return portId !== (WarningsPort as PortId) && !String(portId).startsWith('__internalPort_');
}

export function projectStoredPortValueForCopy(
  outputs: InputsOrOutputsWithRefs,
  portId: PortId,
  dataRefs: DataRefReader,
): unknown | undefined {
  if (!(portId in outputs)) {
    return undefined;
  }

  const restoredValue = restoreStoredPortValue(outputs, portId, dataRefs);
  if (restoredValue) {
    return projectDataValue(restoredValue);
  }

  return isStoredRefDataValue(outputs[portId]) ? MISSING_STORED_VALUE_TEXT : 'undefined';
}

function serializeGenericDisplayedOutputs(
  data: Pick<NodeRunDataWithRefs, 'outputData' | 'splitOutputData'>,
  dataRefs: DataRefReader,
  outputDefinitions?: readonly Pick<NodeOutputDefinition, 'id' | 'title'>[],
): string | undefined {
  if (data.splitOutputData) {
    const serializedSplits = Object.entries(data.splitOutputData)
      .sort(([left], [right]) => Number(left) - Number(right))
      .flatMap(([, outputs]) => {
        const serialized = serializeStoredOutputPortMap(outputs, dataRefs, outputDefinitions);
        return serialized === undefined ? [] : [serialized];
      });

    return serializedSplits.length > 0 ? serializedSplits.join('\n\n') : undefined;
  }

  return serializeStoredOutputPortMap(data.outputData, dataRefs, outputDefinitions);
}

function serializeStoredOutputPortMap(
  outputs: InputsOrOutputsWithRefs | undefined,
  dataRefs: DataRefReader,
  outputDefinitions?: readonly Pick<NodeOutputDefinition, 'id' | 'title'>[],
): string | undefined {
  if (!outputs) {
    return undefined;
  }

  const visibleEntries = Object.keys(outputs)
    .filter(isVisiblePort)
    .map((portId) => ({
      label: outputDefinitions?.find((definition) => definition.id === portId)?.title ?? portId,
      value: projectStoredPortValueForCopy(outputs, portId as PortId, dataRefs),
    }));

  if (visibleEntries.length === 0) {
    return undefined;
  }

  if (visibleEntries.length === 1) {
    return serializeProjectedCopyValue(visibleEntries[0]!.value);
  }

  return serializeProjectedCopyValue(displayCopySections(visibleEntries));
}

function serializeProjectedCopyValue(value: unknown): string {
  if (isDisplayCopySections(value)) {
    return value.sections
      .map(({ label, value: sectionValue }) => `${label}\n${serializeProjectedCopyValue(sectionValue)}`)
      .join('\n\n');
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    try {
      return String(value);
    } catch {
      return '';
    }
  }
}
