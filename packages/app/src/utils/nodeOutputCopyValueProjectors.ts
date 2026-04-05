import { coerceTypeOptional, getScalarTypeOf, type DataValue, type PortId } from '@ironclad/rivet-core';
import type { NodeOutputCopyValueProjector } from './executionDataCopyValue.js';
import {
  isVisibleCopyValuePort,
  projectDataValueForCopyValue,
  projectStoredOutputPortMapForCopyValue,
  projectStoredPortValueForCopyValue,
} from './executionDataCopyValue.js';
import { restoreStoredPortValue } from './executionDataReaders.js';

const CHAT_META_PORT_IDS = ['requestTokens', 'responseTokens', 'cost', 'duration'] as const;

export const getChatNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const visibleEntries: [string, unknown][] = [];

  const responseValue = projectStoredPortValueForCopyValue(outputs, 'response' as PortId, dataRefs);
  if (responseValue !== undefined) {
    visibleEntries.push(['response', responseValue]);
  }

  const functionCallsPortId = outputs['function-calls' as PortId]
    ? ('function-calls' as PortId)
    : outputs['function-call' as PortId]
      ? ('function-call' as PortId)
      : undefined;

  if (functionCallsPortId) {
    const functionValue = projectStoredPortValueForCopyValue(outputs, functionCallsPortId, dataRefs);
    if (functionValue !== undefined) {
      visibleEntries.push([functionCallsPortId, functionValue]);
    }
  }

  const requestTokensValue = restoreStoredPortValue(outputs, 'requestTokens' as PortId, dataRefs);
  const responseTokensValue = restoreStoredPortValue(outputs, 'responseTokens' as PortId, dataRefs);
  const costValue = restoreStoredPortValue(outputs, 'cost' as PortId, dataRefs);
  const durationValue = restoreStoredPortValue(outputs, 'duration' as PortId, dataRefs);

  for (const portId of CHAT_META_PORT_IDS) {
    const metricValue =
      portId === 'requestTokens'
        ? requestTokensValue
        : portId === 'responseTokens'
          ? responseTokensValue
          : portId === 'cost'
            ? costValue
            : durationValue;

    const isVisible =
      portId === 'duration'
        ? hasVisibleChatDurationMetric(durationValue, {
            requestTokens: requestTokensValue,
            responseTokens: responseTokensValue,
            cost: costValue,
          })
        : hasVisiblePositiveChatMetric(metricValue);

    if (!isVisible) {
      continue;
    }

    const projectedValue = projectStoredPortValueForCopyValue(outputs, portId as PortId, dataRefs);
    if (projectedValue !== undefined) {
      visibleEntries.push([portId, projectedValue]);
    }
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

  return projectDataValueForCopyValue(questionsAndAnswersValue);
};

export const getLoopControllerNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const breakValue = restoreStoredPortValue(outputs, 'break' as PortId, dataRefs);
  const outputKeys = Object.keys(outputs)
    .filter((key) => key.startsWith('output'))
    .sort(compareNumericPortSuffixes);

  const projectedOutputs: Record<string, unknown> = {
    continue: breakValue == null || breakValue.type === 'control-flow-excluded',
  };

  for (const key of outputKeys) {
    const projectedValue = projectStoredPortValueForCopyValue(outputs, key as PortId, dataRefs);
    if (projectedValue !== undefined) {
      projectedOutputs[key] = projectedValue;
    }
  }

  return projectedOutputs;
};

export const getSubGraphNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const result: Record<string, unknown> = {};

  const costValue = restoreStoredPortValue(outputs, 'cost' as PortId, dataRefs);
  if (hasVisiblePositiveScalarMetric(costValue)) {
    const projectedCost = projectStoredPortValueForCopyValue(outputs, 'cost' as PortId, dataRefs);
    if (projectedCost !== undefined) {
      result.cost = projectedCost;
    }
  }

  const durationValue = restoreStoredPortValue(outputs, 'duration' as PortId, dataRefs);
  if (hasVisiblePositiveScalarMetric(durationValue)) {
    const projectedDuration = projectStoredPortValueForCopyValue(outputs, 'duration' as PortId, dataRefs);
    if (projectedDuration !== undefined) {
      result.duration = projectedDuration;
    }
  }

  const visibleBodyEntries = Object.fromEntries(
    Object.entries(outputs).filter(([portId]) => portId !== 'cost' && portId !== 'duration'),
  );

  const bodyPortIds = Object.keys(visibleBodyEntries).filter(isVisibleCopyValuePort);
  const projectedBody = projectStoredOutputPortMapForCopyValue(visibleBodyEntries, dataRefs);

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

function hasVisiblePositiveChatMetric(value: DataValue | undefined): boolean {
  return hasVisiblePositiveScalarMetric(value) || hasVisiblePositiveNumberArrayMetric(value);
}

function hasVisiblePositiveScalarMetric(value: DataValue | undefined): boolean {
  if (!value || value.type === 'control-flow-excluded') {
    return false;
  }

  const scalarValue = coerceTypeOptional(value, 'number');
  return scalarValue != null && scalarValue > 0;
}

function hasVisiblePositiveNumberArrayMetric(value: DataValue | undefined): boolean {
  if (!value || value.type === 'control-flow-excluded') {
    return false;
  }

  const arrayValue = coerceTypeOptional(value, 'number[]');
  return arrayValue?.some((item) => item > 0) ?? false;
}

function hasVisibleChatDurationMetric(
  durationValue: DataValue | undefined,
  carrierValues: {
    requestTokens: DataValue | undefined;
    responseTokens: DataValue | undefined;
    cost: DataValue | undefined;
  },
): boolean {
  if (!durationValue || durationValue.type === 'control-flow-excluded') {
    return false;
  }

  const scalarDuration = coerceTypeOptional(durationValue, 'number');
  if (scalarDuration != null) {
    return scalarDuration > 0 && hasVisibleChatMetricCarrier(carrierValues);
  }

  const arrayDuration = coerceTypeOptional(durationValue, 'number[]');
  if (!arrayDuration?.length) {
    return false;
  }

  return arrayDuration.some(
    (duration, index) => duration > 0 && hasVisibleChatMetricCarrierAtIndex(carrierValues, index),
  );
}

function hasVisibleChatMetricCarrier(carrierValues: {
  requestTokens: DataValue | undefined;
  responseTokens: DataValue | undefined;
  cost: DataValue | undefined;
}): boolean {
  return (
    hasPresentScalarNumberValue(carrierValues.requestTokens) ||
    hasPresentScalarNumberValue(carrierValues.responseTokens) ||
    hasPresentScalarNumberValue(carrierValues.cost)
  );
}

function hasVisibleChatMetricCarrierAtIndex(
  carrierValues: {
    requestTokens: DataValue | undefined;
    responseTokens: DataValue | undefined;
    cost: DataValue | undefined;
  },
  index: number,
): boolean {
  return (
    hasPresentNumberArrayValueAtIndex(carrierValues.requestTokens, index) ||
    hasPresentNumberArrayValueAtIndex(carrierValues.responseTokens, index) ||
    hasPresentNumberArrayValueAtIndex(carrierValues.cost, index)
  );
}

function hasPresentScalarNumberValue(value: DataValue | undefined): boolean {
  if (!value || value.type === 'control-flow-excluded') {
    return false;
  }

  return coerceTypeOptional(value, 'number') != null;
}

function hasPresentNumberArrayValueAtIndex(value: DataValue | undefined, index: number): boolean {
  if (!value || value.type === 'control-flow-excluded') {
    return false;
  }

  const arrayValue = coerceTypeOptional(value, 'number[]');
  return arrayValue != null && index < arrayValue.length && arrayValue[index] != null;
}

function compareNumericPortSuffixes(left: string, right: string): number {
  const leftSuffix = Number(left.replace(/^\D+/, ''));
  const rightSuffix = Number(right.replace(/^\D+/, ''));
  return leftSuffix - rightSuffix;
}
