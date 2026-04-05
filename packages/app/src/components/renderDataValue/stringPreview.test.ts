import assert from 'node:assert/strict';
import test from 'node:test';
import { getRenderedStringText } from './stringPreview.js';

test('getRenderedStringText does not truncate full output when not compact and no explicit limit is set', () => {
  const longString = 'x'.repeat(400);

  assert.equal(getRenderedStringText(longString, { isCompact: false }), longString);
});

test('getRenderedStringText compacts long single-line output in compact mode', () => {
  const longString = `${'A'.repeat(500)}UNIQUE_TRAILING_MARKER`;
  const rendered = getRenderedStringText(longString, { isCompact: true });

  assert.ok(!rendered.includes('UNIQUE_TRAILING_MARKER'));
});

test('getRenderedStringText honors explicit truncateLength outside compact mode', () => {
  const rendered = getRenderedStringText('abcdefghijklmnopqrstuvwxyz', { truncateLength: 10, isCompact: false });

  assert.equal(rendered, 'abcdefghij...');
});
