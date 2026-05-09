import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataValue, Outputs, PortId } from '@valerypopoff/rivet2-core';
import type { DataRefStore } from '../providers/ProvidersContext.js';
import {
  clearExecutionDataRefs,
  restoreStoredDataValue,
  restoreStoredInputsOrOutputs,
  storeDataValueForHistory,
  storeInputsOrOutputsForHistory,
  storeNodeDataForHistory,
} from './executionDataTransforms.js';
import { REF_STORAGE_THRESHOLD_CHARS } from './outputStorageLimits.js';

function createDataRefStore(): DataRefStore & {
  values: Map<string, DataValue>;
  sizeHints: Map<string, number>;
} {
  const values = new Map<string, DataValue>();
  const sizeHints = new Map<string, number>();

  return {
    values,
    sizeHints,
    get: (key) => values.get(key),
    set: (key, value, options) => {
      values.set(key, value);
      if (options?.sizeHint != null) {
        sizeHints.set(key, options.sizeHint);
      }
    },
    delete: (key) => {
      values.delete(key);
      sizeHints.delete(key);
    },
  };
}

test('storeDataValueForHistory stores large strings by ref and restores them losslessly', () => {
  const dataRefs = createDataRefStore();
  const value = { type: 'string', value: 'a'.repeat(REF_STORAGE_THRESHOLD_CHARS + 100) } as const;

  const stored = storeDataValueForHistory(value, dataRefs, {
    nodeId: 'node-1',
    processId: 'process-1',
    channel: 'output',
  }, 'output' as PortId);

  assert.equal(stored.storage, 'ref');
  assert.equal(stored.refId, 'execution:node-1:process-1:output:output');
  assert.equal(stored.preview.kind, 'text');
  assert.equal(stored.preview.excerpt.endsWith('\n...'), true);
  assert.equal(dataRefs.values.get(stored.refId), value);
  assert.deepEqual(restoreStoredDataValue(stored, dataRefs), value);
});

test('storeDataValueForHistory marks large multi-line string previews as truncated when only the line limit is exceeded', () => {
  const dataRefs = createDataRefStore();
  const value = {
    type: 'string',
    value: Array.from({ length: 3000 }, (_, index) => `L${index}`).join('\n'),
  } as const;

  const stored = storeDataValueForHistory(value, dataRefs, {
    nodeId: 'node-line-limit',
    processId: 'process-line-limit',
    channel: 'output',
  }, 'output' as PortId);

  assert.equal(stored.storage, 'ref');
  assert.equal(stored.preview.kind, 'text');
  assert.equal(stored.preview.excerpt, 'L0\nL1\nL2\n...');
});

test('storeDataValueForHistory keeps smaller strings inline', () => {
  const dataRefs = createDataRefStore();
  const value = { type: 'string', value: 'small value' } as const;

  const stored = storeDataValueForHistory(value, dataRefs, {
    nodeId: 'node-1',
    processId: 'process-1',
    channel: 'output',
  }, 'output' as PortId);

  assert.deepEqual(stored, {
    type: 'string',
    storage: 'inline',
    value: 'small value',
  });
  assert.equal(dataRefs.values.size, 0);
});

test('storeDataValueForHistory keeps malformed string values inline without throwing', () => {
  const dataRefs = createDataRefStore();
  const value = { type: 'string', value: undefined } as unknown as DataValue;

  const stored = storeDataValueForHistory(
    value,
    dataRefs,
    {
      nodeId: 'node-malformed-string',
      processId: 'process-malformed-string',
      channel: 'output',
    },
    'output' as PortId,
  );

  assert.deepEqual(stored, {
    type: 'string',
    storage: 'inline',
    value: undefined,
  });
  assert.equal(dataRefs.values.size, 0);
});

test('storeDataValueForHistory keeps malformed string arrays inline without throwing', () => {
  const dataRefs = createDataRefStore();
  const value = { type: 'string[]', value: undefined } as unknown as DataValue;

  const stored = storeDataValueForHistory(
    value,
    dataRefs,
    {
      nodeId: 'node-malformed-string-array',
      processId: 'process-malformed-string-array',
      channel: 'output',
    },
    'output' as PortId,
  );

  assert.deepEqual(stored, {
    type: 'string[]',
    storage: 'inline',
    value: undefined,
  });
  assert.equal(dataRefs.values.size, 0);
});

test('storeDataValueForHistory keeps malformed media values inline without throwing', () => {
  const dataRefs = createDataRefStore();
  const value = { type: 'image', value: undefined } as unknown as DataValue;

  const stored = storeDataValueForHistory(
    value,
    dataRefs,
    {
      nodeId: 'node-malformed-image',
      processId: 'process-malformed-image',
      channel: 'output',
    },
    'output' as PortId,
  );

  assert.deepEqual(stored, {
    type: 'image',
    storage: 'inline',
    value: undefined,
  });
  assert.equal(dataRefs.values.size, 0);
});

test('storeDataValueForHistory keeps malformed media arrays inline without throwing', () => {
  const dataRefs = createDataRefStore();
  const value = { type: 'binary[]', value: undefined } as unknown as DataValue;

  const stored = storeDataValueForHistory(
    value,
    dataRefs,
    {
      nodeId: 'node-malformed-binary-array',
      processId: 'process-malformed-binary-array',
      channel: 'output',
    },
    'output' as PortId,
  );

  assert.deepEqual(stored, {
    type: 'binary[]',
    storage: 'inline',
    value: undefined,
  });
  assert.equal(dataRefs.values.size, 0);
});

test('storeInputsOrOutputsForHistory stores large objects by ref with json preview', () => {
  const dataRefs = createDataRefStore();
  const objectValue = {
    type: 'object',
    value: Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`key-${index}`, `value-${index}-${'x'.repeat(64)}`])),
  } as const;

  const stored = storeInputsOrOutputsForHistory(
    { output: objectValue } as any,
    dataRefs,
    {
      nodeId: 'node-2',
      processId: 'process-2',
      channel: 'output',
    },
  );

  assert.equal((stored as any)?.output.storage, 'ref');
  assert.equal((stored as any)?.output.preview.kind, 'json');
  assert.equal((stored as any)?.output.preview.excerpt.endsWith('\n...'), true);
  assert.deepEqual(restoreStoredInputsOrOutputs(stored, dataRefs), {
    output: objectValue,
  } as any);
});

test('storeDataValueForHistory keeps undefined items visible in large any-array previews', () => {
  const dataRefs = createDataRefStore();
  const value: DataValue = {
    type: 'any[]',
    value: [
      undefined,
      ...Array.from({ length: 400 }, (_, index) => ({ [`key-${index}`]: `value-${index}-${'x'.repeat(64)}` })),
    ],
  };

  const stored = storeDataValueForHistory(value, dataRefs, {
    nodeId: 'node-any-array',
    processId: 'process-any-array',
    channel: 'output',
  }, 'output' as PortId);

  assert.equal(stored.storage, 'ref');
  assert.equal(stored.preview.kind, 'json');
  assert.match(stored.preview.excerpt, /"undefined"/);
  assert.doesNotMatch(stored.preview.excerpt, /^\[\n  null,/);
  assert.deepEqual(dataRefs.values.get(stored.refId), value);
  assert.equal((dataRefs.values.get(stored.refId) as Extract<DataValue, { type: 'any[]' }>).value[0], undefined);
  assert.deepEqual(restoreStoredDataValue(stored, dataRefs), value);
});

test('storeDataValueForHistory reuses stable ref ids for repeated writes to the same port', () => {
  const dataRefs = createDataRefStore();

  const first = storeDataValueForHistory(
    { type: 'string', value: 'a'.repeat(REF_STORAGE_THRESHOLD_CHARS + 1) },
    dataRefs,
    {
      nodeId: 'node-3',
      processId: 'process-3',
      channel: 'output',
    },
    'output' as PortId,
  );
  const second = storeDataValueForHistory(
    { type: 'string', value: 'b'.repeat(REF_STORAGE_THRESHOLD_CHARS + 2) },
    dataRefs,
    {
      nodeId: 'node-3',
      processId: 'process-3',
      channel: 'output',
    },
    'output' as PortId,
  );

  assert.equal(first.storage, 'ref');
  assert.equal(second.storage, 'ref');
  assert.equal(first.refId, second.refId);
  assert.equal(dataRefs.values.size, 1);
  assert.equal(dataRefs.values.get(first.refId)?.type, 'string');
  assert.equal((dataRefs.values.get(first.refId) as Extract<DataValue, { type: 'string' }>)?.value[0], 'b');
});

test('clearExecutionDataRefs removes all execution-scoped refs from previous run data', () => {
  const dataRefs = createDataRefStore();
  dataRefs.set('execution:node-4:process-4:output:output', {
    type: 'string',
    value: 'persisted',
  });

  clearExecutionDataRefs(dataRefs, {
    'node-4': [
      {
        processId: 'process-4' as any,
        data: {
          outputData: {
            output: {
              type: 'string',
              storage: 'ref',
              refId: 'execution:node-4:process-4:output:output',
              preview: {
                kind: 'text',
                excerpt: 'persisted',
                totalChars: 9,
                lineCount: 1,
              },
            },
          },
        },
      },
    ],
  } as any);

  assert.equal(dataRefs.values.size, 0);
});

test('storeNodeDataForHistory omits undefined input and output fields so later updates do not clobber earlier run data', () => {
  const dataRefs = createDataRefStore();

  const stored = storeNodeDataForHistory(
    {
      status: { type: 'ok' },
      outputData: {
        output: {
          type: 'number',
          value: 42,
        },
      } as Outputs,
    },
    dataRefs,
    {
      nodeId: 'node-5',
      processId: 'process-5',
    },
  );

  assert.deepEqual(stored, {
    status: { type: 'ok' },
    outputData: {
      output: {
        type: 'number',
        storage: 'inline',
        value: 42,
      },
    },
  });
  assert.equal('inputData' in stored, false);
  assert.equal('splitOutputData' in stored, false);
});

test('storeNodeDataForHistory preserves node debug snapshots for later output rendering', () => {
  const dataRefs = createDataRefStore();

  const stored = storeNodeDataForHistory(
    {
      debugData: {
        expressionSource: '{{a}} * 2',
        extractObjectPathSource: '$.aaa["{{field}}"]',
        extractObjectPathUsePathInput: false,
      },
      status: { type: 'running' },
    },
    dataRefs,
    {
      nodeId: 'node-expression',
      processId: 'process-expression',
    },
  );

  assert.deepEqual(stored, {
    debugData: {
      expressionSource: '{{a}} * 2',
      extractObjectPathSource: '$.aaa["{{field}}"]',
      extractObjectPathUsePathInput: false,
    },
    status: { type: 'running' },
  });
});

test('storeNodeDataForHistory preserves interpolation input snapshots for parsed-source rendering', () => {
  const dataRefs = createDataRefStore();
  const largeInput = {
    type: 'string',
    value: `prefix ${'x'.repeat(REF_STORAGE_THRESHOLD_CHARS)}`,
  } as const;

  const stored = storeNodeDataForHistory(
    {
      debugData: {
        expressionSource: '{{value}}',
      },
      inputData: {
        value: largeInput,
      } as any,
      status: { type: 'ok' },
    },
    dataRefs,
    {
      nodeId: 'node-expression-inputs',
      processId: 'process-expression-inputs',
    },
  );

  assert.equal((stored.inputData as any).value.storage, 'ref');
  assert.deepEqual(restoreStoredInputsOrOutputs(stored.inputData as any, dataRefs), {
    value: largeInput,
  });
  assert.deepEqual(stored.debugData, {
    expressionSource: '{{value}}',
  });
});
