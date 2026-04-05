import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataValue } from '@ironclad/rivet-core';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs } from '../state/dataFlow.js';
import { WarningsPort } from '../../../core/src/utils/symbols.js';
import {
  projectDisplayedNodeOutputsForCopyValue,
  serializeDisplayedNodeOutputsForCopyValue,
} from './executionDataCopyValue.js';

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

test('serializeDisplayedNodeOutputsForCopyValue returns the plain value for a single string port', () => {
  const serialized = serializeDisplayedNodeOutputsForCopyValue(
    {
      outputData: {
        output: inlineStored('string', 'hello'),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(serialized, 'hello');
});

test('serializeDisplayedNodeOutputsForCopyValue copies raw object JSON for a single object output', () => {
  const serialized = serializeDisplayedNodeOutputsForCopyValue(
    {
      outputData: {
        output: inlineStored('object', {
          key: 'Hello world!',
        }),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(
    serialized,
    JSON.stringify(
      {
        key: 'Hello world!',
      },
      null,
      2,
    ),
  );
});

test('serializeDisplayedNodeOutputsForCopyValue follows inferred preview semantics for any values', () => {
  const serialized = serializeDisplayedNodeOutputsForCopyValue(
    {
      outputData: {
        output: inlineStored('any', {
          key: 'Hello world!',
        }),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(
    serialized,
    JSON.stringify(
      {
        key: 'Hello world!',
      },
      null,
      2,
    ),
  );
});

test('serializeDisplayedNodeOutputsForCopyValue copies raw arrays without DataValue wrappers', () => {
  const serialized = serializeDisplayedNodeOutputsForCopyValue(
    {
      outputData: {
        output: inlineStored('string[]', ['one', 'two']),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(serialized, JSON.stringify(['one', 'two'], null, 2));
});

test('serializeDisplayedNodeOutputsForCopyValue matches the preview text for control-flow-excluded values', () => {
  const serialized = serializeDisplayedNodeOutputsForCopyValue(
    {
      outputData: {
        output: inlineStored('control-flow-excluded', undefined),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(serialized, 'Not ran');
});

test('serializeDisplayedNodeOutputsForCopyValue keeps chat-message flattening semantics', () => {
  const serialized = serializeDisplayedNodeOutputsForCopyValue(
    {
      outputData: {
        output: inlineStored('chat-message', {
          type: 'assistant',
          message: ['Hello', { type: 'url', url: 'https://example.com' }],
          function_call: undefined,
          function_calls: undefined,
        }),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(serialized, 'Hello\n\nhttps://example.com');
});

test('projectDisplayedNodeOutputsForCopyValue copies multi-port outputs as a raw plain-value map and excludes warnings', () => {
  const projected = projectDisplayedNodeOutputsForCopyValue(
    {
      outputData: {
        output: inlineStored('object', { key: 'value' }),
        details: inlineStored('string[]', ['a', 'b']),
        [WarningsPort]: inlineStored('string[]', ['warning']),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.deepEqual(projected, {
    output: {
      key: 'value',
    },
    details: ['a', 'b'],
  });
});

test('serializeDisplayedNodeOutputsForCopyValue serializes split outputs and preserves index ordering', () => {
  const serialized = serializeDisplayedNodeOutputsForCopyValue(
    {
      splitOutputData: {
        1: {
          output: inlineStored('object', {
            second: true,
          }),
        },
        0: {
          output: inlineStored('string', 'first'),
        },
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(
    serialized,
    JSON.stringify(
      {
        0: 'first',
        1: {
          second: true,
        },
      },
      null,
      2,
    ),
  );
});
