import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveLargeStoredValuePreviewFullText } from './largeStoredValuePreviewText.js';

test('deriveLargeStoredValuePreviewFullText returns raw string values', () => {
  assert.equal(
    deriveLargeStoredValuePreviewFullText({
      type: 'string',
      value: 'hello',
    }),
    'hello',
  );
});

test('deriveLargeStoredValuePreviewFullText joins string arrays with newlines', () => {
  assert.equal(
    deriveLargeStoredValuePreviewFullText({
      type: 'string[]',
      value: ['alpha', 'beta'],
    }),
    'alpha\nbeta',
  );
});

test('deriveLargeStoredValuePreviewFullText pretty-prints object values', () => {
  assert.equal(
    deriveLargeStoredValuePreviewFullText({
      type: 'object',
      value: { alpha: 1 },
    }),
    '{\n  "alpha": 1\n}',
  );
});

test('deriveLargeStoredValuePreviewFullText pretty-prints object array values', () => {
  assert.equal(
    deriveLargeStoredValuePreviewFullText({
      type: 'object[]',
      value: [{ alpha: 1 }],
    }),
    '[\n  {\n    "alpha": 1\n  }\n]',
  );
});

test('deriveLargeStoredValuePreviewFullText keeps string any values raw', () => {
  assert.equal(
    deriveLargeStoredValuePreviewFullText({
      type: 'any',
      value: 'hello',
    }),
    'hello',
  );
});

test('deriveLargeStoredValuePreviewFullText pretty-prints object any values', () => {
  assert.equal(
    deriveLargeStoredValuePreviewFullText({
      type: 'any',
      value: { alpha: true },
    }),
    '{\n  "alpha": true\n}',
  );
});

test('deriveLargeStoredValuePreviewFullText returns undefined for missing or unsupported values', () => {
  assert.equal(deriveLargeStoredValuePreviewFullText(undefined), undefined);
  assert.equal(
    deriveLargeStoredValuePreviewFullText({
      type: 'number',
      value: 1,
    }),
    undefined,
  );
});
