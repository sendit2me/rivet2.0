import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findFullscreenOutputSearchMatchOffsets,
  getWrappedFullscreenOutputSearchMatchIndex,
  normalizeFullscreenOutputSearchQuery,
  projectFullscreenOutputSearchMatches,
  type FullscreenOutputSearchProjectableBlock,
} from './fullscreenOutputSearch.js';
import { isFullscreenOutputSearchBoundaryTagName } from './fullscreenOutputSearchDom.js';

test('normalizeFullscreenOutputSearchQuery lowercases the query', () => {
  assert.equal(normalizeFullscreenOutputSearchQuery('HeLLo'), 'hello');
});

test('findFullscreenOutputSearchMatchOffsets is case-insensitive and returns non-overlapping matches', () => {
  assert.deepEqual(findFullscreenOutputSearchMatchOffsets('Hello hello HELLO', 'heLLo'), [0, 6, 12]);
  assert.deepEqual(findFullscreenOutputSearchMatchOffsets('banana', 'ana'), [1]);
});

test('findFullscreenOutputSearchMatchOffsets returns zero matches for an empty query', () => {
  assert.deepEqual(findFullscreenOutputSearchMatchOffsets('hello', ''), []);
});

test('getWrappedFullscreenOutputSearchMatchIndex wraps in both directions', () => {
  assert.equal(getWrappedFullscreenOutputSearchMatchIndex(3, 2, 1), 0);
  assert.equal(getWrappedFullscreenOutputSearchMatchIndex(3, 0, -1), 2);
  assert.equal(getWrappedFullscreenOutputSearchMatchIndex(0, 0, 1), 0);
});

test('projectFullscreenOutputSearchMatches keeps document-order block sequencing across dom and provider blocks', () => {
  const blocks: FullscreenOutputSearchProjectableBlock[] = [
    {
      kind: 'dom',
      text: 'alpha',
    },
    {
      kind: 'provider',
      providerId: 'provider-1',
    },
    {
      kind: 'dom',
      text: 'beta alpha alpha',
    },
  ];

  const matches = projectFullscreenOutputSearchMatches(blocks, 'alpha', {
    'provider-1': [3, 9],
  });

  assert.deepEqual(
    matches.map((match) =>
      match.kind === 'provider'
        ? `provider:${match.blockIndex}:${match.localMatchIndex}`
        : `dom:${match.blockIndex}:${match.localMatchIndex}`,
    ),
    ['dom:0:0', 'provider:1:0', 'provider:1:1', 'dom:2:0', 'dom:2:1'],
  );
});

test('projectFullscreenOutputSearchMatches only includes providers that are present in the current block list', () => {
  const blocks: FullscreenOutputSearchProjectableBlock[] = [
    {
      kind: 'dom',
      text: 'current page',
    },
  ];

  const matches = projectFullscreenOutputSearchMatches(blocks, 'match', {
    'provider-from-other-page': [0, 10],
  });

  assert.deepEqual(matches, []);
});

test('isFullscreenOutputSearchBoundaryTagName marks block tags as boundaries', () => {
  assert.equal(isFullscreenOutputSearchBoundaryTagName('DIV'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('PRE'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('P'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('LI'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('TABLE'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('TR'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('TD'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('TH'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('H1'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('H6'), true);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('BR'), true);
});

test('isFullscreenOutputSearchBoundaryTagName leaves inline-ish tags non-boundary', () => {
  assert.equal(isFullscreenOutputSearchBoundaryTagName('SPAN'), false);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('STRONG'), false);
  assert.equal(isFullscreenOutputSearchBoundaryTagName('CODE'), false);
});
