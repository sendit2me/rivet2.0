import { coerceTypeOptional, getScalarTypeOf, type DataValue, type PortId } from '@ironclad/rivet-core';
import type { NodeOutputCopyValueProjector } from './executionDataCopyValue.js';
import {
  isVisiblePort,
  projectDataValue,
  projectStoredMap,
} from './executionDataCopyValue.js';
import { restoreStoredPortValue } from './executionDataReaders.js';

export const getChatNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const visibleEntries: [string, unknown][] = [];

  const responseValue = restoreStoredPortValue(outputs, 'response' as PortId, dataRefs);
  if (responseValue) {
    visibleEntries.push(['response', projectDataValue(responseValue)]);
  }

  const functionCallPortId = outputs['function-calls' as PortId]
    ? ('function-calls' as PortId)
    : outputs['function-call' as PortId]
      ? ('function-call' as PortId)
      : undefined;
  const functionCallValue = functionCallPortId ? restoreStoredPortValue(outputs, functionCallPortId, dataRefs) : undefined;

  if (functionCallPortId && functionCallValue) {
    visibleEntries.push([functionCallPortId, projectDataValue(functionCallValue)]);
  }

  const requestTokensValue = restoreStoredPortValue(outputs, 'requestTokens' as PortId, dataRefs);
  const responseTokensValue = restoreStoredPortValue(outputs, 'responseTokens' as PortId, dataRefs);
  const costValue = restoreStoredPortValue(outputs, 'cost' as PortId, dataRefs);
  const durationValue = restoreStoredPortValue(outputs, 'duration' as PortId, dataRefs);
  const carriers = [requestTokensValue, responseTokensValue, costValue];
  const metrics: [string, DataValue | undefined, boolean][] = [
    ['requestTokens', requestTokensValue, isPositiveMetric(requestTokensValue)],
    ['responseTokens', responseTokensValue, isPositiveMetric(responseTokensValue)],
    ['cost', costValue, isPositiveMetric(costValue)],
    ['duration', durationValue, isVisibleChatDuration(durationValue, carriers)],
  ];

  for (const [portId, value, isVisible] of metrics) {
    if (!value || !isVisible) {
      continue;
    }

    visibleEntries.push([portId, projectDataValue(value)]);
  }

  if (visibleEntries.length === 0) {
    return undefined;
  }

  if (visibleEntries.length === 1 && visibleEntries[0]![0] === 'response') {
    return visibleEntries[0]![1];
  }

  return Object.fromEntries(visibleEntries);
};

export const getUserInputNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const questionsAndAnswersValue = restoreStoredPortValue(outputs, 'questionsAndAnswers' as PortId, dataRefs);
  if (!questionsAndAnswersValue || getScalarTypeOf(questionsAndAnswersValue.type) === 'control-flow-excluded') {
    return undefined;
  }

  return projectDataValue(questionsAndAnswersValue);
};

export const getLoopControllerNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const breakValue = restoreStoredPortValue(outputs, 'break' as PortId, dataRefs);
  const outputKeys = Object.keys(outputs)
    .filter((key) => key.startsWith('output'))
    .sort((left, right) => Number(left.replace(/^\D+/, '')) - Number(right.replace(/^\D+/, '')));

  const projectedOutputs: Record<string, unknown> = {
    continue: breakValue == null || breakValue.type === 'control-flow-excluded',
  };

  for (const key of outputKeys) {
    const outputValue = restoreStoredPortValue(outputs, key as PortId, dataRefs);
    if (outputValue !== undefined) {
      projectedOutputs[key] = projectDataValue(outputValue);
    }
  }

  return projectedOutputs;
};

export const getSubGraphNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const result: Record<string, unknown> = {};

  const costValue = restoreStoredPortValue(outputs, 'cost' as PortId, dataRefs);
  if (coerceTypeOptional(costValue, 'number') != null && isPositiveMetric(costValue)) {
    result.cost = projectDataValue(costValue!);
  }

  const durationValue = restoreStoredPortValue(outputs, 'duration' as PortId, dataRefs);
  if (coerceTypeOptional(durationValue, 'number') != null && isPositiveMetric(durationValue)) {
    result.duration = projectDataValue(durationValue!);
  }

  const bodyOutputs = Object.fromEntries(
    Object.entries(outputs).filter(([portId]) => portId !== 'cost' && portId !== 'duration'),
  );
  const bodyPortIds = Object.keys(bodyOutputs).filter(isVisiblePort);
  const projectedBody = projectStoredMap(bodyOutputs, dataRefs);

  if (Object.keys(result).length === 0) {
    return projectedBody;
  }

  if (projectedBody === undefined) {
    return Object.keys(result).length > 0 ? result : undefined;
  }

  if (bodyPortIds.length === 1) {
    result[bodyPortIds[0]!] = projectedBody;
    return result;
  }

  if (typeof projectedBody === 'object' && projectedBody !== null && !Array.isArray(projectedBody)) {
    return {
      ...result,
      ...(projectedBody as Record<string, unknown>),
    };
  }

  result.output = projectedBody;
  return result;
};

function isPositiveMetric(value: DataValue | undefined, index?: number): boolean {
  if (!value || value.type === 'control-flow-excluded') {
    return false;
  }

  const scalarValue = coerceTypeOptional(value, 'number');
  if (scalarValue != null) {
    return scalarValue > 0;
  }

  const arrayValue = coerceTypeOptional(value, 'number[]');
  if (!arrayValue?.length) {
    return false;
  }

  return index == null ? arrayValue.some((item) => item > 0) : (arrayValue[index] ?? 0) > 0;
}

function isVisibleChatDuration(
  durationValue: DataValue | undefined,
  carrierValues: Array<DataValue | undefined>,
): boolean {
  if (coerceTypeOptional(durationValue, 'number') != null) {
    return isPositiveMetric(durationValue) && hasAnyCarrier(carrierValues);
  }

  const arrayDuration = coerceTypeOptional(durationValue, 'number[]');
  if (!arrayDuration?.length) {
    return false;
  }

  return arrayDuration.some((duration, index) => duration > 0 && hasAnyCarrier(carrierValues, index));
}

function hasAnyCarrier(carrierValues: Array<DataValue | undefined>, index?: number): boolean {
  return carrierValues.some((value) => {
    if (!value || value.type === 'control-flow-excluded') {
      return false;
    }

    if (index == null) {
      return coerceTypeOptional(value, 'number') != null;
    }

    const arrayValue = coerceTypeOptional(value, 'number[]');
    return arrayValue != null && index < arrayValue.length && arrayValue[index] != null;
  });
}
