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
  assert.equal(rendered.endsWith('\n...'), true);
});

test('getRenderedStringText honors explicit truncateLength outside compact mode', () => {
  const rendered = getRenderedStringText('abcdefghijklmnopqrstuvwxyz', { truncateLength: 10, isCompact: false });

  assert.equal(rendered, 'abcdefghij\n...');
});

test('getRenderedStringText marks multi-line compact truncation when the line limit removes content', () => {
  const rendered = getRenderedStringText('line-1\nline-2\nline-3\nline-4', { isCompact: true });

  assert.equal(rendered, 'line-1\nline-2\nline-3\n...');
});

test('getRenderedStringText does not append an ellipsis when compact output fully fits the preview limits', () => {
  const rendered = getRenderedStringText('line-1\nline-2\nline-3', { isCompact: true });

  assert.equal(rendered, 'line-1\nline-2\nline-3');
});

test('getRenderedStringText appends a single ellipsis when compact output hits both line and char limits', () => {
  const rendered = getRenderedStringText(`${'A'.repeat(120)}\n${'B'.repeat(120)}\n${'C'.repeat(120)}\n${'D'.repeat(120)}`, {
    isCompact: true,
  });

  assert.equal(rendered.endsWith('\n...'), true);
  assert.equal(rendered.endsWith('\n......'), false);
});
