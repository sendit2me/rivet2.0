import {
  arrayizeDataValue,
  type ChatMessage,
  type ChatMessageMessagePart,
  type DataType,
  type DataValue,
  getScalarTypeOf,
  isArrayDataType,
  isArrayDataValue,
  type Inputs,
  type Outputs,
  type PortId,
  type ScalarOrArrayDataValue,
} from '@valerypopoff/rivet2-core';
import { cloneDeep, mapValues } from 'lodash-es';
import { P, match } from 'ts-pattern';
import { entries } from './typeSafety.js';
import type { DataRefReader, DataRefStore } from '../providers/ProvidersContext.js';
import type {
  DataValueWithRefs,
  InputsOrOutputsWithRefs,
  NodeRunData,
  NodeRunDataWithRefs,
  RunDataByNodeId,
  StoredDataPreview,
  StoredDataValue,
} from '../state/dataFlow.js';
import {
  COMPACT_PREVIEW_MAX_CHARS,
  COMPACT_PREVIEW_MAX_ITEMS,
  COMPACT_PREVIEW_MAX_LINES,
  REF_STORAGE_THRESHOLD_CHARS,
} from './outputStorageLimits.js';
import { buildTextPreviewExcerpt } from './textPreview.js';

type DataRefDeleter = Pick<DataRefStore, 'delete'>;

export type RefScope = {
  nodeId: string;
  processId: string;
  channel: 'input' | 'output';
  splitIndex?: number;
};

type StorageDecision =
  | {
      storage: 'inline';
    }
  | {
      storage: 'ref';
      preview: StoredDataPreview;
      sizeHint?: number;
    };

export function sanitizeInputsOrOutputs<T extends Inputs | Outputs>(data: T): T {
  const sanitized: Partial<Record<keyof T, DataValue>> = {};

  for (const [key, value] of entries(data)) {
    sanitized[key as keyof T] = fixDataValueUint8Arrays(value) as DataValue;
  }

  return sanitized as T;
}

export function fixDataValueUint8Arrays(value: DataValue | undefined): DataValue | undefined {
  if (!value) {
    return undefined;
  }

  if (isArrayDataValue(value)) {
    const arrayized = arrayizeDataValue(value);

    return {
      ...value,
      value: arrayized.map((item) => fixDataValueUint8Arrays(item)!.value),
    } as DataValue;
  }

  const fix = (uint8ArrayOrObject: Uint8Array | object) =>
    uint8ArrayOrObject instanceof Uint8Array ? uint8ArrayOrObject : Uint8Array.from(Object.values(uint8ArrayOrObject));

  return match(value)
    .with({ type: 'binary' }, (binaryValue): DataValue => ({
      ...binaryValue,
      value: fix(binaryValue.value),
    }))
    .with({ type: 'audio' }, (audioValue): DataValue => ({
      ...audioValue,
      value: {
        ...audioValue.value,
        data: fix(audioValue.value.data),
      },
    }))
    .with({ type: 'document' }, (documentValue): DataValue => ({
      ...documentValue,
      value: {
        ...documentValue.value,
        data: fix(documentValue.value.data),
      },
    }))
    .with({ type: 'image' }, (imageValue): DataValue => ({
      ...imageValue,
      value: {
        ...imageValue.value,
        data: fix(imageValue.value.data),
      },
    }))
    .with({ type: 'chat-message' }, (chatMessageValue): DataValue => ({
      ...chatMessageValue,
      value: {
        ...chatMessageValue.value,
        message: Array.isArray(chatMessageValue.value.message)
          ? chatMessageValue.value.message.map((part) => fixChatMessagePartUint8Arrays(part))
          : fixChatMessagePartUint8Arrays(chatMessageValue.value.message),
      },
    }))
    .otherwise((otherValue): DataValue => otherValue);
}

export function storeNodeDataForHistory(
  data: Partial<NodeRunData>,
  refStore: DataRefStore,
  scope: Omit<RefScope, 'channel'>,
): Partial<NodeRunDataWithRefs> {
  const storedData: Partial<NodeRunDataWithRefs> = {};

  if (data.startedAt !== undefined) {
    storedData.startedAt = data.startedAt;
  }

  if (data.finishedAt !== undefined) {
    storedData.finishedAt = data.finishedAt;
  }

  if (data.debugData !== undefined) {
    storedData.debugData = cloneDeep(data.debugData);
  }

  if (data.status !== undefined) {
    storedData.status = data.status;
  }

  if (data.inputData !== undefined) {
    storedData.inputData = storeInputsOrOutputsForHistory(data.inputData, refStore, {
      ...scope,
      channel: 'input',
    });
  }

  if (data.outputData !== undefined) {
    storedData.outputData = storeInputsOrOutputsForHistory(data.outputData, refStore, {
      ...scope,
      channel: 'output',
    });
  }

  if (data.splitOutputData !== undefined) {
    storedData.splitOutputData = mapValues(data.splitOutputData, (value, key) =>
      storeInputsOrOutputsForHistory(value, refStore, {
        ...scope,
        channel: 'output',
        splitIndex: Number(key),
      }),
    ) as NodeRunDataWithRefs['splitOutputData'];
  }

  return storedData;
}

export function storeInputsOrOutputsForHistory(
  data: Inputs | Outputs | undefined,
  refStore: DataRefStore,
  scope: RefScope,
): InputsOrOutputsWithRefs | undefined {
  if (data == null) {
    return undefined;
  }

  return mapValues(data as Record<PortId, DataValue>, (value, portId) => {
    if (!value) {
      return undefined as unknown as StoredDataValue;
    }

    return storeDataValueForHistory(value, refStore, scope, portId as PortId);
  }) as InputsOrOutputsWithRefs;
}

export function storeDataValueForHistory(
  value: DataValue,
  refStore: DataRefStore,
  scope: RefScope,
  portId: PortId,
): StoredDataValue {
  const fixedValue = fixDataValueUint8Arrays(value)!;
  const decision = getStorageDecision(fixedValue);

  if (decision.storage === 'inline') {
    return toStoredInlineDataValue(fixedValue);
  }

  const refId = buildExecutionDataRefId(scope, portId);
  refStore.set(refId, fixedValue, decision.sizeHint != null ? { sizeHint: decision.sizeHint } : undefined);

  return {
    type: fixedValue.type,
    storage: 'ref',
    refId,
    preview: decision.preview,
  } as StoredDataValue;
}

export function toStoredInlineDataValue(value: DataValue): StoredDataValue {
  return {
    type: value.type,
    storage: 'inline',
    value: cloneDeep(value.value),
  } as StoredDataValue;
}

export function isStoredRefDataValue(value: DataValueWithRefs | DataValue | undefined): value is Extract<StoredDataValue, { storage: 'ref' }> {
  return !!value && 'storage' in value && value.storage === 'ref';
}

export function isStoredInlineDataValue(
  value: DataValueWithRefs | DataValue | undefined,
): value is Extract<StoredDataValue, { storage: 'inline' }> {
  return !!value && 'storage' in value && value.storage === 'inline';
}

export function isPreviewOnlyStoredValue(value: DataValueWithRefs | DataValue | undefined): value is Extract<StoredDataValue, { storage: 'ref' }> {
  if (!isStoredRefDataValue(value)) {
    return false;
  }

  const scalarType = getScalarTypeOf(value.type);
  return scalarType === 'string' || scalarType === 'object' || scalarType === 'any';
}

export function getStoredValuePreview(
  value: DataValueWithRefs | DataValue | undefined,
): StoredDataPreview | undefined {
  return isStoredRefDataValue(value) ? value.preview : undefined;
}

export function restoreStoredDataValue(value: DataValueWithRefs, refStore: DataRefReader): DataValue {
  if (isStoredInlineDataValue(value)) {
    return {
      type: value.type,
      value: cloneDeep(value.value),
    } as DataValue;
  }

  if (!('storage' in value)) {
    return cloneDeep(value) as DataValue;
  }

  const resolved = refStore.get(value.refId);

  if (!resolved) {
    throw new Error(`Could not restore ref-backed value ${value.refId} for type ${value.type}`);
  }

  return fixDataValueUint8Arrays(cloneDeep(resolved))!;
}

export function tryRestoreStoredDataValue(value: DataValueWithRefs | undefined, refStore: DataRefReader): DataValue | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return restoreStoredDataValue(value, refStore);
  } catch {
    return undefined;
  }
}

export function restoreStoredInputsOrOutputs(
  data: InputsOrOutputsWithRefs | undefined,
  refStore: DataRefReader,
): Inputs | Outputs | undefined {
  if (!data) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(data).map(([portId, storedValue]) => [portId, restoreStoredDataValue(storedValue!, refStore)]),
  ) as Inputs | Outputs;
}

export function tryRestoreStoredInputsOrOutputs(
  data: InputsOrOutputsWithRefs | undefined,
  refStore: DataRefReader,
): Inputs | Outputs | undefined {
  if (!data) {
    return undefined;
  }

  try {
    return restoreStoredInputsOrOutputs(data, refStore);
  } catch {
    return undefined;
  }
}

export function collectStoredRefIds(
  data: InputsOrOutputsWithRefs | NodeRunDataWithRefs | undefined,
): string[] {
  if (!data) {
    return [];
  }

  if (isStoredNodeRunData(data)) {
    const runData = data;
    return [
      ...collectStoredRefIds(runData.inputData),
      ...collectStoredRefIds(runData.outputData),
      ...(runData.splitOutputData
        ? Object.values(runData.splitOutputData).flatMap((value) => collectStoredRefIds(value))
        : []),
    ];
  }

  return Object.values(data).flatMap((value) => (isStoredRefDataValue(value) ? [value.refId] : []));
}

export function clearExecutionDataRefs(refStore: DataRefDeleter, previousRunData: RunDataByNodeId): void {
  const allRefIds = Object.values(previousRunData).flatMap((processes) =>
    processes.flatMap((process) => collectStoredRefIds(process.data)),
  );

  for (const refId of allRefIds) {
    refStore.delete(refId);
  }
}

export function deleteStoredRefIds(refStore: DataRefDeleter, refIds: Iterable<string>): void {
  for (const refId of refIds) {
    refStore.delete(refId);
  }
}

function getStorageDecision(value: DataValue): StorageDecision {
  if (shouldAlwaysStoreByRef(value)) {
    return {
      storage: 'ref',
      preview: buildSummaryPreview(value),
      sizeHint: getDataValueSizeHint(value),
    };
  }

  switch (value.type) {
    case 'string': {
      return value.value.length > REF_STORAGE_THRESHOLD_CHARS
        ? {
            storage: 'ref',
            preview: buildTextPreview(value.value),
            sizeHint: value.value.length,
          }
        : { storage: 'inline' };
    }
    case 'string[]': {
      const totalChars = value.value.reduce((acc, current) => acc + current.length, 0);
      return totalChars > REF_STORAGE_THRESHOLD_CHARS
        ? {
            storage: 'ref',
            preview: buildTextPreview(value.value.slice(0, COMPACT_PREVIEW_MAX_ITEMS).join('\n')),
            sizeHint: totalChars,
          }
        : { storage: 'inline' };
    }
    case 'object':
    case 'object[]': {
      const stringified = stringifyForPreview(value.value);
      return stringified.length > REF_STORAGE_THRESHOLD_CHARS
        ? {
            storage: 'ref',
            preview: buildJsonPreview(stringified, Array.isArray(value.value) ? value.value.length : undefined),
            sizeHint: stringified.length,
          }
        : { storage: 'inline' };
    }
    case 'any':
    case 'any[]': {
      return getAnyStorageDecision(value);
    }
    default: {
      if (isArrayDataType(value.type)) {
        const serialized = stringifyForPreview(value.value);
        return serialized.length > REF_STORAGE_THRESHOLD_CHARS
          ? {
              storage: 'ref',
              preview: buildSummaryPreview(value),
              sizeHint: serialized.length,
            }
          : { storage: 'inline' };
      }

      return { storage: 'inline' };
    }
  }
}

function getAnyStorageDecision(value: Extract<DataValue, { type: 'any' | 'any[]' }>): StorageDecision {
  if (typeof value.value === 'string') {
    return value.value.length > REF_STORAGE_THRESHOLD_CHARS
      ? {
          storage: 'ref',
          preview: buildTextPreview(value.value),
          sizeHint: value.value.length,
        }
      : { storage: 'inline' };
  }

  if (Array.isArray(value.value) || isPlainRecord(value.value)) {
    const stringified = stringifyForPreview(value.value);
    return stringified.length > REF_STORAGE_THRESHOLD_CHARS
      ? {
          storage: 'ref',
          preview: buildJsonPreview(stringified, Array.isArray(value.value) ? value.value.length : undefined),
          sizeHint: stringified.length,
        }
      : { storage: 'inline' };
  }

  return { storage: 'inline' };
}

function shouldAlwaysStoreByRef(value: DataValue): boolean {
  const scalarType = getScalarTypeOf(value.type);

  return (
    scalarType === 'audio' ||
    scalarType === 'binary' ||
    scalarType === 'image' ||
    scalarType === 'document' ||
    scalarType === 'chat-message'
  );
}

function buildTextPreview(text: string): StoredDataPreview {
  return {
    kind: 'text',
    excerpt: createExcerpt(text, COMPACT_PREVIEW_MAX_CHARS, COMPACT_PREVIEW_MAX_LINES),
    totalChars: text.length,
    lineCount: text.split('\n').length,
    encodedHint: getEncodedHint(text),
  };
}

function buildJsonPreview(text: string, itemCount?: number): StoredDataPreview {
  return {
    kind: 'json',
    excerpt: createExcerpt(text, COMPACT_PREVIEW_MAX_CHARS, COMPACT_PREVIEW_MAX_LINES),
    totalChars: text.length,
    itemCount,
  };
}

function buildSummaryPreview(value: DataValue): StoredDataPreview {
  return match(value)
    .with({ type: 'binary' }, (binaryValue): StoredDataPreview => ({
      kind: 'summary',
      label: 'Binary',
      totalBytes: binaryValue.value.byteLength,
    }))
    .with({ type: 'binary[]' }, (binaryValues): StoredDataPreview => ({
      kind: 'summary',
      label: 'Binary Array',
      totalBytes: binaryValues.value.reduce((acc, current) => acc + current.byteLength, 0),
      itemCount: binaryValues.value.length,
    }))
    .with({ type: 'image' }, (imageValue): StoredDataPreview => ({
      kind: 'summary',
      label: `Image (${imageValue.value.mediaType})`,
      totalBytes: imageValue.value.data.byteLength,
    }))
    .with({ type: 'image[]' }, (imageValues): StoredDataPreview => ({
      kind: 'summary',
      label: 'Image Array',
      totalBytes: imageValues.value.reduce((acc, current) => acc + current.data.byteLength, 0),
      itemCount: imageValues.value.length,
    }))
    .with({ type: 'audio' }, (audioValue): StoredDataPreview => ({
      kind: 'summary',
      label: `Audio (${audioValue.value.mediaType ?? 'unknown'})`,
      totalBytes: audioValue.value.data.byteLength,
    }))
    .with({ type: 'audio[]' }, (audioValues): StoredDataPreview => ({
      kind: 'summary',
      label: 'Audio Array',
      totalBytes: audioValues.value.reduce((acc, current) => acc + current.data.byteLength, 0),
      itemCount: audioValues.value.length,
    }))
    .with({ type: 'document' }, (documentValue): StoredDataPreview => ({
      kind: 'summary',
      label: `Document (${documentValue.value.mediaType})`,
      totalBytes: documentValue.value.data.byteLength,
    }))
    .with({ type: 'document[]' }, (documentValues): StoredDataPreview => ({
      kind: 'summary',
      label: 'Document Array',
      totalBytes: documentValues.value.reduce((acc, current) => acc + current.data.byteLength, 0),
      itemCount: documentValues.value.length,
    }))
    .with({ type: 'chat-message' }, (chatMessageValue): StoredDataPreview => ({
      kind: 'summary',
      label: `Chat Message (${chatMessageValue.value.type})`,
      totalBytes: getChatMessageSize(chatMessageValue.value),
    }))
    .with({ type: 'chat-message[]' }, (chatMessageValues): StoredDataPreview => ({
      kind: 'summary',
      label: 'Chat Message Array',
      totalBytes: chatMessageValues.value.reduce((acc, current) => acc + getChatMessageSize(current), 0),
      itemCount: chatMessageValues.value.length,
    }))
    .otherwise((): StoredDataPreview => ({
      kind: 'summary',
      label: value.type,
      totalBytes: getDataValueSizeHint(value),
      itemCount: Array.isArray((value as { value?: unknown[] }).value) ? (value as { value: unknown[] }).value.length : undefined,
    }));
}

function getDataValueSizeHint(value: DataValue): number {
  return match(value)
    .with({ type: 'image' }, (imageValue) => imageValue.value.data.byteLength)
    .with({ type: 'binary' }, (binaryValue) => binaryValue.value.byteLength)
    .with({ type: 'audio' }, (audioValue) => audioValue.value.data.byteLength)
    .with({ type: 'document' }, (documentValue) => documentValue.value.data.byteLength)
    .with({ type: 'image[]' }, (imageValues) => imageValues.value.reduce((acc, current) => acc + current.data.byteLength, 0))
    .with({ type: 'binary[]' }, (binaryValues) => binaryValues.value.reduce((acc, current) => acc + current.byteLength, 0))
    .with({ type: 'audio[]' }, (audioValues) => audioValues.value.reduce((acc, current) => acc + current.data.byteLength, 0))
    .with({ type: 'document[]' }, (documentValues) => documentValues.value.reduce((acc, current) => acc + current.data.byteLength, 0))
    .with({ type: 'chat-message' }, (chatMessageValue) => getChatMessageSize(chatMessageValue.value))
    .with({ type: 'chat-message[]' }, (chatMessageValues) =>
      chatMessageValues.value.reduce((acc, current) => acc + getChatMessageSize(current), 0),
    )
    .with({ type: 'string' }, (stringValue) => stringValue.value.length)
    .with({ type: 'string[]' }, (stringValues) => stringValues.value.reduce((acc, current) => acc + current.length, 0))
    .otherwise((otherValue) => stringifyForPreview(otherValue.value).length);
}

function buildExecutionDataRefId(scope: RefScope, portId: PortId): string {
  if (scope.splitIndex != null) {
    return `execution:${scope.nodeId}:${scope.processId}:${scope.channel}:${scope.splitIndex}:${portId}`;
  }

  return `execution:${scope.nodeId}:${scope.processId}:${scope.channel}:${portId}`;
}

function createExcerpt(text: string, maxChars: number, maxLines: number): string {
  return buildTextPreviewExcerpt(text, {
    maxChars,
    maxLines,
  }).text;
}

function getEncodedHint(text: string): 'base64' | 'data-uri' | undefined {
  if (text.startsWith('data:') && text.includes(';base64,')) {
    return 'data-uri';
  }

  const compact = text.replace(/\s+/g, '');
  if (
    compact.length > 256 &&
    compact.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(compact) &&
    !compact.includes('{') &&
    !compact.includes('}')
  ) {
    return 'base64';
  }

  return undefined;
}

function stringifyForPreview(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return String(value);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isStoredNodeRunData(value: InputsOrOutputsWithRefs | NodeRunDataWithRefs): value is NodeRunDataWithRefs {
  return 'inputData' in value || 'outputData' in value || 'splitOutputData' in value || 'status' in value;
}

function getChatMessageSize(value: ChatMessage): number {
  const parts = Array.isArray(value.message) ? value.message : [value.message];

  return parts.reduce(
    (acc, part) =>
      match(part)
        .with(P.string, (stringPart) => acc + stringPart.length)
        .with({ type: 'document' }, (documentPart) => acc + documentPart.data.byteLength)
        .with({ type: 'image' }, (imagePart) => acc + imagePart.data.byteLength)
        .with({ type: 'url' }, (urlPart) => acc + urlPart.url.length)
        .exhaustive(),
    0,
  );
}

function fixChatMessagePartUint8Arrays(part: ChatMessageMessagePart): ChatMessageMessagePart {
  return match(part)
    .with(P.string, (stringPart) => stringPart)
    .with({ type: 'document' }, (documentPart) => ({
      ...documentPart,
      data: Uint8Array.from(Object.values(documentPart.data)),
    }))
    .otherwise((otherPart) => otherPart);
}
