import assert from 'node:assert/strict';
import test from 'node:test';
import { findMatchOffsets, projectMatches, type SearchBlock } from './fullscreenOutputSearch.js';

test('findMatchOffsets is case-insensitive and returns non-overlapping matches', () => {
  assert.deepEqual(findMatchOffsets('Hello hello HELLO', 'heLLo'), [0, 6, 12]);
  assert.deepEqual(findMatchOffsets('banana', 'ana'), [1]);
});

test('findMatchOffsets returns zero matches for an empty query', () => {
  assert.deepEqual(findMatchOffsets('hello', ''), []);
});

test('projectMatches keeps document-order sequencing across text and provider blocks', () => {
  const blocks: SearchBlock[] = [
    {
      kind: 'text',
      textNodes: [],
      text: 'alpha',
      matches: [0],
    },
    {
      kind: 'provider',
      providerId: 'provider-1',
      matches: [3, 9],
    },
    {
      kind: 'text',
      textNodes: [],
      text: 'beta alpha alpha',
      matches: [5, 11],
    },
  ];

  const matches = projectMatches(blocks, 'alpha');

  assert.deepEqual(
    matches.map((match) =>
      match.kind === 'provider'
        ? `provider:${match.blockIndex}:${match.localMatchIndex}`
        : `text:${match.blockIndex}:${match.localMatchIndex}`,
    ),
    ['text:0:0', 'provider:1:0', 'provider:1:1', 'text:2:0', 'text:2:1'],
  );
});

test('projectMatches returns zero matches for an empty query even when blocks carry match offsets', () => {
  const blocks: SearchBlock[] = [
    {
      kind: 'text',
      textNodes: [],
      text: 'alpha',
      matches: [0],
    },
  ];

  assert.deepEqual(projectMatches(blocks, ''), []);
});
