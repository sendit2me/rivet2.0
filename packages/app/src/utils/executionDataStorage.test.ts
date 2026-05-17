import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataValue, PortId } from '@valerypopoff/rivet2-core';
import type { DataRefStore } from '../providers/ProvidersContext.js';
import {
  collectStoredRefIds,
  restoreStoredInputsOrOutputs,
  storeDataValueForHistory,
  storeInputsOrOutputsForHistory,
} from './executionDataStorage.js';
import { REF_STORAGE_THRESHOLD_CHARS } from './outputStorageLimits.js';

function createDataRefStore(): DataRefStore & {
  values: Map<string, DataValue>;
} {
  const values = new Map<string, DataValue>();

  return {
    values,
    get: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
    },
    delete: (key) => {
      values.delete(key);
    },
  };
}

test('storeDataValueForHistory includes split index in ref ids for split outputs', () => {
  const dataRefs = createDataRefStore();

  const stored = storeDataValueForHistory(
    { type: 'string', value: 'x'.repeat(REF_STORAGE_THRESHOLD_CHARS + 1) },
    dataRefs,
    {
      nodeId: 'node-split',
      processId: 'process-split',
      channel: 'output',
      splitIndex: 2,
    },
    'output' as PortId,
  );

  assert.equal(stored.storage, 'ref');
  assert.equal(stored.refId, 'execution:node-split:process-split:output:2:output');
  assert.equal(dataRefs.values.has(stored.refId), true);
});

test('storeInputsOrOutputsForHistory skips absent port payloads', () => {
  const dataRefs = createDataRefStore();

  const stored = storeInputsOrOutputsForHistory(
    {
      present: { type: 'string', value: 'hello' },
      missing: undefined,
    } as never,
    dataRefs,
    {
      nodeId: 'node',
      processId: 'process',
      channel: 'output',
    },
  );

  assert.deepEqual(Object.keys(stored ?? {}), ['present']);
  assert.deepEqual(stored?.['present' as PortId], {
    type: 'string',
    storage: 'inline',
    value: 'hello',
  });
});

test('restoreStoredInputsOrOutputs ignores legacy nullish port payloads', () => {
  const dataRefs = createDataRefStore();

  const restored = restoreStoredInputsOrOutputs(
    {
      present: {
        type: 'string',
        storage: 'inline',
        value: 'hello',
      },
      missing: undefined,
    } as never,
    dataRefs,
  );

  assert.deepEqual(restored, {
    present: { type: 'string', value: 'hello' },
  });
});

test('collectStoredRefIds collects input, output, and split-output refs from node run data', () => {
  const refIds = collectStoredRefIds({
    inputData: {
      input: {
        type: 'string',
        storage: 'ref',
        refId: 'input-ref',
        preview: {
          kind: 'text',
          excerpt: 'input',
          totalChars: 5,
          lineCount: 1,
        },
      },
    },
    outputData: {
      output: {
        type: 'object',
        storage: 'ref',
        refId: 'output-ref',
        preview: {
          kind: 'json',
          excerpt: '{}',
          totalChars: 2,
        },
      },
    },
    splitOutputData: {
      0: {
        split: {
          type: 'string',
          storage: 'ref',
          refId: 'split-ref',
          preview: {
            kind: 'text',
            excerpt: 'split',
            totalChars: 5,
            lineCount: 1,
          },
        },
      },
    },
  } as never);

  assert.deepEqual(refIds, ['input-ref', 'output-ref', 'split-ref']);
});

test('collectStoredRefIds tolerates legacy nullish split-output entries', () => {
  const refIds = collectStoredRefIds({
    splitOutputData: {
      0: undefined,
      1: {
        split: {
          type: 'string',
          storage: 'ref',
          refId: 'split-ref',
          preview: {
            kind: 'text',
            excerpt: 'split',
            totalChars: 5,
            lineCount: 1,
          },
        },
      },
    },
  } as never);

  assert.deepEqual(refIds, ['split-ref']);
});

test('collectStoredRefIds treats status-like port names as ordinary port maps', () => {
  const refIds = collectStoredRefIds({
    status: {
      type: 'string',
      storage: 'ref',
      refId: 'status-port-ref',
      preview: {
        kind: 'text',
        excerpt: 'status',
        totalChars: 6,
        lineCount: 1,
      },
    },
    inputData: {
      type: 'object',
      storage: 'ref',
      refId: 'input-data-port-ref',
      preview: {
        kind: 'json',
        excerpt: '{}',
        totalChars: 2,
      },
    },
    outputData: {
      type: 'object',
      storage: 'ref',
      refId: 'output-data-port-ref',
      preview: {
        kind: 'json',
        excerpt: '{}',
        totalChars: 2,
      },
    },
    splitOutputData: {
      type: 'object',
      storage: 'ref',
      refId: 'split-output-data-port-ref',
      preview: {
        kind: 'json',
        excerpt: '{}',
        totalChars: 2,
      },
    },
  } as never);

  assert.deepEqual(refIds, [
    'status-port-ref',
    'input-data-port-ref',
    'output-data-port-ref',
    'split-output-data-port-ref',
  ]);
});
