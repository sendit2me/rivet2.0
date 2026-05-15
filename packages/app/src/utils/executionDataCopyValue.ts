import {
  type NodeOutputDefinition,
  type DataValue,
  type PortId,
  WarningsPort,
  getScalarTypeOf,
  inferType,
  isFunctionDataType,
} from '@valerypopoff/rivet2-core';
import prettyBytes from 'pretty-bytes';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { InputsOrOutputsWithRefs, NodeRunDataWithRefs } from '../state/dataFlow.js';
import { restoreStoredPortValue } from './executionDataReaders.js';
import { isStoredRefDataValue } from './executionDataTransforms.js';
import {
  getByteLength,
  getStringProperty,
  isRecord,
  stringifyUninferredAnyValue,
} from './dataValuePayloads.js';

export type NodeOutputCopyValueProjectorArgs = {
  outputs: InputsOrOutputsWithRefs;
  dataRefs: DataRefReader;
};

export type NodeOutputCopyValueProjector = (args: NodeOutputCopyValueProjectorArgs) => unknown | undefined;

export type DisplayCopySection = {
  label: string;
  value: unknown;
};

const DISPLAY_COPY_SECTIONS = Symbol('display-copy-sections');
const MISSING_STORED_VALUE_TEXT = 'Value no longer available in memory.';

type DisplayCopySections = {
  [DISPLAY_COPY_SECTIONS]: true;
  sections: DisplayCopySection[];
};

export function displayCopySections(sections: DisplayCopySection[]): unknown {
  return {
    [DISPLAY_COPY_SECTIONS]: true,
    sections,
  };
}

export function projectDataValue(value: DataValue): unknown {
  switch (value.type) {
    case 'string':
    case 'date':
    case 'time':
    case 'datetime':
    case 'number':
    case 'boolean':
    case 'string[]':
    case 'number[]':
    case 'boolean[]':
    case 'object':
    case 'object[]':
      return value.value;
    case 'any':
      return projectAnyRuntimeValue(value.value, new WeakMap());
    case 'any[]': {
      if (Array.isArray(value.value)) {
        return projectAnyRuntimeArray(value.value, new WeakMap());
      }

      const inferredValue = inferType(value.value);
      if (inferredValue.type === 'any' || inferredValue.type === 'any[]') {
        return inferredValue.value;
      }
      return projectDataValue(inferredValue);
    }
    case 'chat-message':
      return serializeChatMessage(value);
    case 'chat-message[]':
      return Array.isArray(value.value)
        ? value.value.map((message) => serializeChatMessage({ type: 'chat-message', value: message }))
        : [];
    case 'control-flow-excluded':
      return 'Not ran';
    case 'vector':
      return `Vector (length ${Array.isArray(value.value) ? value.value.length : 0})`;
    case 'binary':
      return `Binary (length ${getByteLength(value.value).toLocaleString()})`;
    case 'graph-reference':
      return `(Reference to graph "${getStringProperty(value.value, 'graphName') ?? 'unknown graph'}")`;
    case 'gpt-function':
      return `GPT Function: ${getStringProperty(value.value, 'name') ?? 'unknown'}`;
    case 'document':
      return serializeDocument(value);
    case 'image':
    case 'audio':
      return value.value;
    default:
      if (isFunctionDataType(value.type)) {
        return `Function<${getScalarTypeOf(value.type)}>`;
      }

      return value.value;
  }
}

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

function serializeChatMessage(value: Extract<DataValue, { type: 'chat-message' }>): string {
  const message = isRecord(value.value) ? value.value.message : undefined;
  const messageParts = Array.isArray(message) ? message : [message];
  return messageParts
    .map(serializeChatMessagePart)
    .filter((part) => part.length > 0)
    .join('\n\n');
}

function serializeDocument(value: Extract<DataValue, { type: 'document' }>): string {
  const document: Record<string, unknown> = isRecord(value.value) ? value.value : {};
  const title = typeof document.title === 'string' && document.title.length > 0 ? document.title : undefined;
  const mediaType = typeof document.mediaType === 'string' ? document.mediaType : 'unknown media type';
  const lines = [`${title ? `Document: ${title}` : 'Document'} (${mediaType})`];

  if (typeof document.context === 'string' && document.context.length > 0) {
    lines.push(document.context);
  }

  if (document.enableCitations === true) {
    lines.push('(Citations enabled)');
  }

  const dataLength = getByteLength(document.data);
  lines.push(`Size: ${dataLength > 0 ? prettyBytes(dataLength) : '0 bytes'}`);

  return lines.join('\n');
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

function isDisplayCopySections(value: unknown): value is DisplayCopySections {
  const candidate = value as DisplayCopySections | undefined;
  return (
    candidate?.[DISPLAY_COPY_SECTIONS] === true &&
    Array.isArray(candidate.sections) &&
    candidate.sections.every((section) => isRecord(section) && typeof section.label === 'string')
  );
}

function projectAnyRuntimeArray(value: unknown[], seen: WeakMap<unknown[], unknown[]>): unknown[] {
  const existing = seen.get(value);
  if (existing) {
    return existing;
  }

  const projected: unknown[] = [];
  seen.set(value, projected);

  for (const item of value) {
    projected.push(projectAnyRuntimeValue(item, seen));
  }

  return projected;
}

function projectAnyRuntimeValue(value: unknown, seen: WeakMap<unknown[], unknown[]>): unknown {
  if (Array.isArray(value)) {
    return projectAnyRuntimeArray(value, seen);
  }

  const inferredValue = inferType(value);
  if (inferredValue.type === 'any' || inferredValue.type === 'any[]') {
    return projectUninferredAnyValue(inferredValue, seen);
  }

  return projectDataValue(inferredValue);
}

function projectUninferredAnyValue(
  value: Extract<DataValue, { type: 'any' | 'any[]' }>,
  seen: WeakMap<unknown[], unknown[]>,
): unknown {
  if (value.type === 'any[]' && Array.isArray(value.value)) {
    return projectAnyRuntimeArray(value.value, seen);
  }

  return value.type === 'any' && value.value === undefined ? stringifyUninferredAnyValue(value.value) : value.value;
}

function serializeChatMessagePart(part: unknown): string {
  if (typeof part === 'string') {
    return part;
  }

  if (!isRecord(part)) {
    return '';
  }

  if (part.type === 'url') {
    return typeof part.url === 'string' ? part.url : '';
  }

  return typeof part.type === 'string' ? `(${part.type})` : '';
}
