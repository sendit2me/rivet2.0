import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectAnyArrayItemsForDisplay,
  stringifyAnyJsonLikeForDisplay,
  stringifyUninferredAnyValue,
} from './dataValuePayloads.js';

test('stringifyUninferredAnyValue displays explicit undefined values', () => {
  assert.equal(stringifyUninferredAnyValue(undefined), 'undefined');
});

test('stringifyUninferredAnyValue keeps null display semantics', () => {
  assert.equal(stringifyUninferredAnyValue(null), 'null');
});

test('projectAnyArrayItemsForDisplay preserves explicit undefined items as visible text', () => {
  assert.deepEqual(projectAnyArrayItemsForDisplay([undefined, [undefined], null]), [
    'undefined',
    ['undefined'],
    null,
  ]);
});

test('projectAnyArrayItemsForDisplay tolerates circular arrays', () => {
  const value: unknown[] = [undefined];
  value.push(value);

  const projected = projectAnyArrayItemsForDisplay(value);

  assert.equal(projected[0], 'undefined');
  assert.equal(projected[1], projected);
});

test('stringifyAnyJsonLikeForDisplay keeps undefined array items searchable', () => {
  assert.equal(stringifyAnyJsonLikeForDisplay([undefined, 'next value']), '[\n  "undefined",\n  "next value"\n]');
});

test('stringifyAnyJsonLikeForDisplay falls back safely for circular arrays', () => {
  const value: unknown[] = [undefined];
  value.push(value);

  assert.equal(stringifyAnyJsonLikeForDisplay(value), ',');
});
