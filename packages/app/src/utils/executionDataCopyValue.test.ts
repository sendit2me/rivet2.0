import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataValue } from '@ironclad/rivet-core';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs } from '../state/dataFlow.js';
import { WarningsPort } from '../../../core/src/utils/symbols.js';
import {
  projectDisplayedOutputs,
  serializeDisplayedOutputs,
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

test('serializeDisplayedOutputs returns the plain value for a single string port', () => {
  const serialized = serializeDisplayedOutputs(
    {
      outputData: {
        output: inlineStored('string', 'hello'),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(serialized, 'hello');
});

test('serializeDisplayedOutputs copies raw object JSON for a single object output', () => {
  const serialized = serializeDisplayedOutputs(
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

test('serializeDisplayedOutputs follows inferred preview semantics for any values', () => {
  const serialized = serializeDisplayedOutputs(
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

test('serializeDisplayedOutputs copies raw arrays without DataValue wrappers', () => {
  const serialized = serializeDisplayedOutputs(
    {
      outputData: {
        output: inlineStored('string[]', ['one', 'two']),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(serialized, JSON.stringify(['one', 'two'], null, 2));
});

test('serializeDisplayedOutputs matches the preview text for control-flow-excluded values', () => {
  const serialized = serializeDisplayedOutputs(
    {
      outputData: {
        output: inlineStored('control-flow-excluded', undefined),
      },
    } as NodeRunDataWithRefs,
    createDataRefStore(),
  );

  assert.equal(serialized, 'Not ran');
});

test('serializeDisplayedOutputs keeps chat-message flattening semantics', () => {
  const serialized = serializeDisplayedOutputs(
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

test('projectDisplayedOutputs copies multi-port outputs as a raw plain-value map and excludes warnings', () => {
  const projected = projectDisplayedOutputs(
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

test('serializeDisplayedOutputs serializes split outputs and preserves index ordering', () => {
  const serialized = serializeDisplayedOutputs(
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
