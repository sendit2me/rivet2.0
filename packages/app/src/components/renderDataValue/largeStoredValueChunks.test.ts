import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLargeStoredValueChunks,
  getLargeStoredValueChunkIndexForOffset,
} from './largeStoredValueChunks.js';

function getRenderedLineCount(text: string): number {
  if (text.length === 0) {
    return 1;
  }

  const newlineCount = text.split('\n').length - 1;
  return text.endsWith('\n') ? newlineCount : newlineCount + 1;
}

test('buildLargeStoredValueChunks covers the full text without gaps or duplication', () => {
  const text = 'line-1\nline-2\nline-3\nline-4\nline-5';
  const chunks = buildLargeStoredValueChunks(text, {
    maxChars: 8,
    maxLines: 2,
  });

  assert.equal(chunks.map((chunk) => chunk.text).join(''), text);
  assert.equal(chunks[0]?.startOffset, 0);
  assert.equal(chunks.at(-1)?.endOffset, text.length);
});

test('buildLargeStoredValueChunks respects the max char and max line limits per chunk', () => {
  const text = 'a\nb\nc\nd\ne\nf\ng';
  const chunks = buildLargeStoredValueChunks(text, {
    maxChars: 4,
    maxLines: 2,
  });

  chunks.forEach((chunk) => {
    assert.ok(chunk.text.length <= 4);
    assert.ok(getRenderedLineCount(chunk.text) <= 2);
  });
});

test('buildLargeStoredValueChunks consumes boundary newlines so the next chunk starts at the following line content', () => {
  const text = 'line-1\nline-2\nline-3';
  const chunks = buildLargeStoredValueChunks(text, {
    maxChars: 64,
    maxLines: 1,
  });

  assert.equal(chunks[0]?.text, 'line-1\n');
  assert.equal(chunks[1]?.text, 'line-2\n');
  assert.equal(chunks[2]?.text, 'line-3');
});

test('getLargeStoredValueChunkIndexForOffset returns the owning chunk for early middle and late matches', () => {
  const text = 'alpha\nbeta\ngamma\ndelta\nepsilon';
  const chunks = buildLargeStoredValueChunks(text, {
    maxChars: 7,
    maxLines: 2,
  });

  assert.equal(getLargeStoredValueChunkIndexForOffset(chunks, 0), 0);
  assert.equal(getLargeStoredValueChunkIndexForOffset(chunks, 9), 1);
  assert.equal(getLargeStoredValueChunkIndexForOffset(chunks, text.length - 1), chunks.length - 1);
});

test('buildLargeStoredValueChunks keeps dense multi-line input contiguous where the old preview logic would skip content', () => {
  const text = Array.from({ length: 12 }, (_, index) => `row-${index + 1}`).join('\n');
  const chunks = buildLargeStoredValueChunks(text, {
    maxChars: 15,
    maxLines: 2,
  });

  assert.equal(chunks.map((chunk) => chunk.text).join(''), text);
  assert.ok(chunks.length > 1);
});
