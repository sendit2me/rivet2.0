import {
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
import { restoreStoredPortMap, restoreStoredPortValue } from './executionDataReaders.js';

export type NodeOutputCopyValueProjectorArgs = {
  outputs: InputsOrOutputsWithRefs;
  dataRefs: DataRefReader;
};

export type NodeOutputCopyValueProjector = (args: NodeOutputCopyValueProjectorArgs) => unknown | undefined;

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
    case 'any[]': {
      const inferredValue = inferType(value.value);
      if (inferredValue.type === 'any' || inferredValue.type === 'any[]') {
        return inferredValue.value;
      }
      return projectDataValue(inferredValue);
    }
    case 'chat-message':
      return serializeChatMessage(value);
    case 'chat-message[]':
      return value.value.map((message) => serializeChatMessage({ type: 'chat-message', value: message }));
    case 'control-flow-excluded':
      return 'Not ran';
    case 'vector':
      return `Vector (length ${value.value.length})`;
    case 'binary':
      return `Binary (length ${value.value.length.toLocaleString()})`;
    case 'graph-reference':
      return `(Reference to graph "${value.value.graphName}")`;
    case 'gpt-function':
      return `GPT Function: ${value.value.name}`;
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

export function projectStoredValue(
  outputs: InputsOrOutputsWithRefs | undefined,
  portId: PortId,
  dataRefs: DataRefReader,
): unknown | undefined {
  const restoredValue = restoreStoredPortValue(outputs, portId, dataRefs);
  return restoredValue ? projectDataValue(restoredValue) : undefined;
}

export function projectStoredMap(
  outputs: InputsOrOutputsWithRefs | undefined,
  dataRefs: DataRefReader,
): unknown | undefined {
  const restoredOutputs = restoreStoredPortMap(outputs, dataRefs);
  if (!restoredOutputs) {
    return undefined;
  }

  const visibleEntries = Object.entries(restoredOutputs).filter(([portId]) => isVisiblePort(portId));
  if (visibleEntries.length === 0) {
    return undefined;
  }

  if (visibleEntries.length === 1) {
    return projectDataValue(visibleEntries[0]![1]!);
  }

  return Object.fromEntries(
    visibleEntries.map(([portId, value]) => [portId, projectDataValue(value!)]),
  );
}

export function projectDisplayedOutputs(
  data: Pick<NodeRunDataWithRefs, 'outputData' | 'splitOutputData'>,
  dataRefs: DataRefReader,
  options?: {
    getCopyValueData?: NodeOutputCopyValueProjector;
  },
): unknown | undefined {
  const { getCopyValueData } = options ?? {};

  if (data.splitOutputData) {
    const projectedSplitOutputs = Object.fromEntries(
      Object.entries(data.splitOutputData)
        .sort(([left], [right]) => Number(left) - Number(right))
        .flatMap(([index, outputs]) => {
          const projectedValue = getCopyValueData
            ? getCopyValueData({ outputs, dataRefs })
            : projectStoredMap(outputs, dataRefs);

          return projectedValue === undefined ? [] : [[Number(index), projectedValue]];
        }),
    );

    return Object.keys(projectedSplitOutputs).length > 0 ? projectedSplitOutputs : undefined;
  }

  if (!data.outputData) {
    return undefined;
  }

  return getCopyValueData
    ? getCopyValueData({ outputs: data.outputData, dataRefs })
    : projectStoredMap(data.outputData, dataRefs);
}

export function serializeDisplayedOutputs(
  data: Pick<NodeRunDataWithRefs, 'outputData' | 'splitOutputData'>,
  dataRefs: DataRefReader,
  options?: {
    getCopyValueData?: NodeOutputCopyValueProjector;
  },
): string | undefined {
  const projectedOutputs = projectDisplayedOutputs(data, dataRefs, options);
  if (projectedOutputs === undefined) {
    return undefined;
  }

  return typeof projectedOutputs === 'string' ? projectedOutputs : JSON.stringify(projectedOutputs, null, 2);
}

export function isVisiblePort(portId: PortId | string): boolean {
  return portId !== (WarningsPort as PortId) && !String(portId).startsWith('__internalPort_');
}

function serializeChatMessage(value: Extract<DataValue, { type: 'chat-message' }>): string {
  const messageParts = Array.isArray(value.value.message) ? value.value.message : [value.value.message];
  return messageParts
    .map((part) => (typeof part === 'string' ? part : part.type === 'url' ? part.url : `(${part.type})`))
    .join('\n\n');
}

function serializeDocument(value: Extract<DataValue, { type: 'document' }>): string {
  const lines = [
    `${value.value.title ? `Document: ${value.value.title}` : 'Document'} (${value.value.mediaType})`,
  ];

  if (value.value.context) {
    lines.push(value.value.context);
  }

  if (value.value.enableCitations) {
    lines.push('(Citations enabled)');
  }

  lines.push(`Size: ${value.value.data.length > 0 ? prettyBytes(value.value.data.length) : '0 bytes'}`);

  return lines.join('\n');
}
