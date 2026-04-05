import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataValue } from '@ironclad/rivet-core';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs } from '../state/dataFlow.js';
import { WarningsPort } from '../../../core/src/utils/symbols.js';
import {
  coerceStoredPortValue,
  getStoredWarningsForNodeOutput,
  restoreDisplayedNodeOutputs,
  restoreStoredPortValue,
  serializeDisplayedNodeOutputsForClipboard,
} from './executionDataReaders.js';

function createDataRefStore(initialValues?: Record<string, DataValue>): DataRefReader {
  const values = new Map<string, DataValue>(Object.entries(initialValues ?? {}));
  return {
    get: (key) => values.get(key),
  };
}

test('serializeDisplayedNodeOutputsForClipboard returns the plain value for a single non-split port', () => {
  const serialized = serializeDisplayedNodeOutputsForClipboard(
    {
      outputData: {
        output: {
          type: 'string',
          storage: 'inline',
          value: 'hello',
        },
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(serialized, 'hello');
});

test('serializeDisplayedNodeOutputsForClipboard serializes split outputs and preserves index ordering', () => {
  const serialized = serializeDisplayedNodeOutputsForClipboard(
    {
      splitOutputData: {
        1: {
          output: {
            type: 'string',
            storage: 'inline',
            value: 'second',
          },
        },
        0: {
          output: {
            type: 'string',
            storage: 'inline',
            value: 'first',
          },
        },
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(
    serialized,
    JSON.stringify(
      {
        0: {
          output: { type: 'string', value: 'first' },
        },
        1: {
          output: { type: 'string', value: 'second' },
        },
      },
      null,
      2,
    ),
  );
});

test('restoreDisplayedNodeOutputs prefers split outputs when they are present', () => {
  const restored = restoreDisplayedNodeOutputs(
    {
      outputData: {
        output: {
          type: 'string',
          storage: 'inline',
          value: 'ignored',
        },
      },
      splitOutputData: {
        0: {
          output: {
            type: 'string',
            storage: 'inline',
            value: 'visible',
          },
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

test('getStoredWarningsForNodeOutput aggregates warnings from split outputs', () => {
  const warnings = getStoredWarningsForNodeOutput(
    {
      splitOutputData: {
        0: {
          [WarningsPort]: {
            type: 'string[]',
            storage: 'inline',
            value: ['first warning'],
          },
        },
        1: {
          [WarningsPort]: {
            type: 'string[]',
            storage: 'inline',
            value: ['second warning', 'first warning'],
          },
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
