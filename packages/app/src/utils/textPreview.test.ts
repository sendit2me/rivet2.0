import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTextPreviewExcerpt } from './textPreview.js';

test('buildTextPreviewExcerpt marks truncation when maxLines removes content without hitting the char limit', () => {
  const result = buildTextPreviewExcerpt('line-1\nline-2\nline-3\nline-4', {
    maxChars: 240,
    maxLines: 3,
  });

  assert.equal(result.truncated, true);
  assert.equal(result.text, 'line-1\nline-2\nline-3\n...');
});

test('buildTextPreviewExcerpt appends a single ellipsis when multiple limits truncate the same value', () => {
  const result = buildTextPreviewExcerpt(`${'A'.repeat(120)}\n${'B'.repeat(120)}\n${'C'.repeat(120)}\n${'D'.repeat(120)}`, {
    maxChars: 240,
    maxLines: 3,
  });

  assert.equal(result.truncated, true);
  assert.equal(result.text.endsWith('\n...'), true);
  assert.equal(result.text.endsWith('\n......'), false);
});

test('buildTextPreviewExcerpt leaves already-fitting text unchanged', () => {
  const result = buildTextPreviewExcerpt('line-1\nline-2\nline-3', {
    maxChars: 240,
    maxLines: 3,
  });

  assert.equal(result.truncated, false);
  assert.equal(result.text, 'line-1\nline-2\nline-3');
});
