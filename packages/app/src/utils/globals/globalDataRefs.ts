import { type DataValue } from '@valerypopoff/rivet2-core';
import { LRUCache } from 'lru-cache';
import { P, match } from 'ts-pattern';
import { getByteLength, getMediaByteLength, getStringProperty, isRecord } from '../dataValuePayloads.js';

const globalDataRefSizeHints = new Map<string, number>();

const globalDataRefs = new LRUCache<string, DataValue>({
  maxSize: 500 * 1024 * 1024, // 500MB
  sizeCalculation: (value, key) => {
    const hintedSize = globalDataRefSizeHints.get(key);
    if (hintedSize != null) {
      return hintedSize;
    }

    return Math.max(
      1,
      match(value)
        .with({ type: 'image' }, (v) => getMediaByteLength(v.value))
        .with({ type: 'binary' }, (v) => getByteLength(v.value))
        .with({ type: 'audio' }, (v) => getMediaByteLength(v.value))
        .with({ type: 'image[]' }, (v) => getArraySize(v.value, getMediaByteLength))
        .with({ type: 'binary[]' }, (v) => getArraySize(v.value, getByteLength))
        .with({ type: 'audio[]' }, (v) => getArraySize(v.value, getMediaByteLength))
        .with({ type: 'document' }, (v) => getMediaByteLength(v.value))
        .with({ type: 'document[]' }, (v) => getArraySize(v.value, getMediaByteLength))
        .with({ type: 'chat-message' }, (v) => getSizeOfChatMessage(v.value))
        .with({ type: 'chat-message[]' }, (v) => getArraySize(v.value, getSizeOfChatMessage))
        .otherwise(getJsonSize),
    );
  },
});

export function getGlobalDataRef(key: string): DataValue | undefined {
  return globalDataRefs.get(key);
}

export function setGlobalDataRef(key: string, value: DataValue, options?: { sizeHint?: number }): void {
  if (options?.sizeHint != null) {
    globalDataRefSizeHints.set(key, options.sizeHint);
  } else {
    globalDataRefSizeHints.delete(key);
  }

  globalDataRefs.set(key, value);
}

export function deleteGlobalDataRef(key: string): void {
  globalDataRefSizeHints.delete(key);
  globalDataRefs.delete(key);
}

function getSizeOfChatMessage(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }

  const parts = Array.isArray(value.message) ? value.message : [value.message];

  const size = parts.reduce(
    (acc, part) =>
      match(part)
        .with(P.string, (p) => (acc as number) + p.length)
        .with({ type: 'document' }, (p) => acc + getMediaByteLength(p))
        .with({ type: 'image' }, (p) => acc + getMediaByteLength(p))
        .with({ type: 'url' }, (p) => acc + (getStringProperty(p, 'url')?.length ?? 0))
        .otherwise(() => acc),
    0,
  );

  return size > 0 ? size : 1; // Empty chat message should still take up some "space"
}

function getArraySize(value: unknown, getItemSize: (value: unknown) => number): number {
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.reduce((acc, current) => acc + getItemSize(current), 0);
}

function getJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return String(value).length;
  }
}
