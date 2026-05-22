import { coerceTypeOptional, getScalarTypeOf, type DataValue, type PortId } from '@valerypopoff/rivet2-core';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { InputsOrOutputsWithRefs } from '../state/dataFlow.js';
import {
  displayCopySections,
  type DisplayCopySection,
  type NodeOutputCopyValueProjector,
  isVisiblePort,
  projectDataValue,
  projectStoredPortValueForCopy,
} from './executionDataCopyValue.js';
import { restoreStoredPortValue } from './executionDataReaders.js';
import {
  formatSubGraphCostMetricForCopy,
  formatSubGraphDurationMetricForCopy,
  getSubGraphCostMetric,
  getSubGraphDurationMetric,
} from './subGraphOutputMetrics.js';

export const getChatNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const visibleEntries: [string, unknown][] = [];

  const responseValue = projectStoredPortValueForCopy(outputs, 'response' as PortId, dataRefs);
  if (responseValue !== undefined) {
    visibleEntries.push(['response', responseValue]);
  }

  const functionCallPortId = outputs['function-calls' as PortId]
    ? ('function-calls' as PortId)
    : outputs['function-call' as PortId]
      ? ('function-call' as PortId)
      : undefined;
  const functionCallValue = functionCallPortId
    ? projectStoredPortValueForCopy(outputs, functionCallPortId, dataRefs)
    : undefined;

  if (functionCallPortId && functionCallValue !== undefined) {
    visibleEntries.push([functionCallPortId, functionCallValue]);
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

    visibleEntries.push([portId, projectChatMetricValue(portId, value)]);
  }

  if (visibleEntries.length === 0) {
    return undefined;
  }

  if (visibleEntries.length === 1) {
    const [portId, value] = visibleEntries[0]!;
    return portId === 'response' ? value : displayCopySections([{ label: getChatCopyLabel(portId), value }]);
  }

  return displayCopySections(visibleEntries.map(([portId, value]) => ({ label: getChatCopyLabel(portId), value })));
};

export const getUserInputNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const questionsAndAnswersValue = restoreStoredPortValue(outputs, 'questionsAndAnswers' as PortId, dataRefs);
  if (questionsAndAnswersValue && getScalarTypeOf(questionsAndAnswersValue.type) === 'control-flow-excluded') {
    return undefined;
  }

  return projectStoredPortValueForCopy(outputs, 'questionsAndAnswers' as PortId, dataRefs);
};

export const getLoopControllerNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const breakValue = outputs['break' as PortId];
  const outputKeys = Object.keys(outputs)
    .filter((key) => key.startsWith('output') && outputs[key as PortId] != null)
    .sort((left, right) => Number(left.replace(/^\D+/, '')) - Number(right.replace(/^\D+/, '')));

  const sections: DisplayCopySection[] = [
    {
      label: 'Continue',
      value: breakValue == null || breakValue.type === 'control-flow-excluded' ? 'true' : 'false',
    },
  ];

  for (const [index, key] of outputKeys.entries()) {
    const outputValue = projectStoredPortValueForCopy(outputs, key as PortId, dataRefs);
    if (outputValue !== undefined) {
      sections.push({
        label: `Output ${index + 1}`,
        value: outputValue,
      });
    }
  }

  return displayCopySections(sections);
};

export const getSubGraphNodeCopyValueData: NodeOutputCopyValueProjector = ({ outputs, dataRefs }) => {
  const sections: DisplayCopySection[] = [];

  const costValue = restoreStoredPortValue(outputs, 'cost' as PortId, dataRefs);
  const costCopyValue = formatSubGraphCostMetricForCopy(getSubGraphCostMetric(costValue));
  if (costCopyValue !== undefined) {
    sections.push({
      label: 'Cost',
      value: costCopyValue,
    });
  }

  const durationValue = restoreStoredPortValue(outputs, 'duration' as PortId, dataRefs);
  const durationCopyValue = formatSubGraphDurationMetricForCopy(getSubGraphDurationMetric(durationValue));
  if (durationCopyValue !== undefined) {
    sections.push({
      label: 'Duration',
      value: durationCopyValue,
    });
  }

  const bodyOutputs = Object.fromEntries(
    Object.entries(outputs).filter(([portId]) => portId !== 'cost' && portId !== 'duration'),
  );
  const bodySections = projectVisibleOutputSections(bodyOutputs, dataRefs);

  if (sections.length === 0) {
    if (bodySections.length === 0) {
      return undefined;
    }

    return bodySections.length === 1 ? bodySections[0]!.value : displayCopySections(bodySections);
  }

  sections.push(...bodySections);

  return displayCopySections(sections);
};

function projectVisibleOutputSections(outputs: InputsOrOutputsWithRefs, dataRefs: DataRefReader): DisplayCopySection[] {
  return Object.keys(outputs)
    .filter((portId) => isVisiblePort(portId) && outputs[portId as PortId] != null)
    .flatMap((portId) => {
      const outputValue = projectStoredPortValueForCopy(outputs, portId as PortId, dataRefs);
      return outputValue === undefined ? [] : [{ label: portId, value: outputValue }];
    });
}

function getChatCopyLabel(portId: string): string {
  switch (portId) {
    case 'response':
      return 'Response';
    case 'function-call':
      return 'Function Call';
    case 'function-calls':
      return 'Function Calls';
    case 'requestTokens':
      return 'Request Tokens';
    case 'responseTokens':
      return 'Response Tokens';
    case 'cost':
      return 'Cost';
    case 'duration':
      return 'Duration';
    default:
      return portId;
  }
}

function projectChatMetricValue(portId: string, value: DataValue): unknown {
  const numberValue = coerceTypeOptional(value, 'number');
  if (numberValue == null) {
    return projectDataValue(value);
  }

  if (portId === 'cost') {
    return `$${numberValue.toFixed(3)}`;
  }

  if (portId === 'duration') {
    return `${numberValue}ms`;
  }

  return numberValue;
}

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
