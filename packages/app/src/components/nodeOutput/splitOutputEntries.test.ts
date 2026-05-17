import assert from 'node:assert/strict';
import test from 'node:test';
import { WarningsPort } from '@valerypopoff/rivet2-core';
import { getSortedSplitOutputEntries, getSortedRenderableSplitOutputEntries } from './splitOutputEntries.js';

test('getSortedSplitOutputEntries sorts split-output indexes numerically', () => {
  const values: Record<string, string> = {
    0: 'zero',
    1: 'one',
    10: 'ten',
    2: 'two',
  };
  // Object.entries usually normalizes integer-like keys, so force an unsorted source order.
  const splitOutputData = new Proxy(
    {},
    {
      ownKeys: () => ['10', '1', '2', '0'],
      get: (_target, key) => (typeof key === 'string' ? values[key] : undefined),
      getOwnPropertyDescriptor: (_target, key) =>
        typeof key === 'string' && key in values ? { configurable: true, enumerable: true } : undefined,
    },
  ) as Record<string, string>;
  const entries = getSortedSplitOutputEntries(splitOutputData);

  assert.deepEqual(
    entries.map(([key]) => key),
    ['0', '1', '2', '10'],
  );
});

test('getSortedRenderableSplitOutputEntries skips split-output entries without visible stored port values', () => {
  const entries = getSortedRenderableSplitOutputEntries({
    2: {
      output: { type: 'string', storage: 'inline', value: 'second' },
    },
    1: {
      output: undefined,
    },
    0: {},
    3: {
      [WarningsPort]: { type: 'string[]', storage: 'inline', value: ['warning'] },
    },
  } as any);

  assert.deepEqual(
    entries.map(([key]) => key),
    ['2'],
  );
});
