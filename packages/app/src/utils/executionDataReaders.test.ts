import assert from 'node:assert/strict';
import test from 'node:test';
import { WarningsPort, type DataValue } from '@valerypopoff/rivet2-core';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs } from '../state/dataFlow.js';
import {
  coerceStoredPortValue,
  getStoredOutputWarnings,
  restoreDisplayedNodeOutputs,
  restoreStoredPortValue,
} from './executionDataReaders.js';

function createDataRefStore(initialValues?: Record<string, DataValue>): DataRefReader {
  const values = new Map<string, DataValue>(Object.entries(initialValues ?? {}));
  return {
    get: (key) => values.get(key),
  };
}

function inlineStored<T extends DataValue['type']>(type: T, value: Extract<DataValue, { type: T }>['value']) {
  return {
    type,
    storage: 'inline' as const,
    value,
  };
}

test('restoreDisplayedNodeOutputs keeps wrapped values for the copy-as-json path', () => {
  const restored = restoreDisplayedNodeOutputs(
    {
      outputData: {
        output: inlineStored('object', {
          key: 'Hello world!',
        }),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.deepEqual(restored, {
    output: {
      type: 'object',
      value: {
        key: 'Hello world!',
      },
    },
  });
});

test('restoreDisplayedNodeOutputs prefers split outputs when they are present', () => {
  const restored = restoreDisplayedNodeOutputs(
    {
      outputData: {
        output: inlineStored('string', 'ignored'),
      },
      splitOutputData: {
        0: {
          output: inlineStored('string', 'visible'),
        },
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.deepEqual(restored, {
    0: {
      output: {
        type: 'string',
        value: 'visible',
      },
    },
  });
});

test('getStoredOutputWarnings aggregates warnings from split outputs', () => {
  const warnings = getStoredOutputWarnings(
    {
      splitOutputData: {
        0: {
          [WarningsPort]: inlineStored('string[]', ['first warning']),
        },
        1: {
          [WarningsPort]: inlineStored('string[]', ['second warning', 'first warning']),
        },
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.deepEqual(warnings, ['first warning', 'second warning']);
});

test('restoreStoredPortValue returns undefined for a missing port', () => {
  const restored = restoreStoredPortValue(undefined, 'missing' as never, createDataRefStore());

  assert.equal(restored, undefined);
});

test('coerceStoredPortValue returns undefined safely for a missing port', () => {
  const restored = coerceStoredPortValue(undefined, 'missing' as never, 'number', createDataRefStore());

  assert.equal(restored, undefined);
});
