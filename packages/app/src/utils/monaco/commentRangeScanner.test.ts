import assert from 'node:assert/strict';
import test from 'node:test';
import { findJsStyleCommentRanges, shouldHighlightJsStyleComments } from './commentRangeScanner.js';

function matchedComments(text: string): string[] {
  return findJsStyleCommentRanges(text).map(({ start, end }) => text.slice(start, end));
}

test('shouldHighlightJsStyleComments enables comment highlighting only for text-like editor languages', () => {
  assert.equal(shouldHighlightJsStyleComments('prompt-interpolation-markdown'), true);
  assert.equal(shouldHighlightJsStyleComments('prompt-interpolation'), true);
  assert.equal(shouldHighlightJsStyleComments('markdown'), true);
  assert.equal(shouldHighlightJsStyleComments('plain-text'), true);
  assert.equal(shouldHighlightJsStyleComments('plaintext'), true);

  assert.equal(shouldHighlightJsStyleComments('javascript'), false);
  assert.equal(shouldHighlightJsStyleComments('json'), false);
  assert.equal(shouldHighlightJsStyleComments(undefined), false);
});

test('findJsStyleCommentRanges finds line and block comments', () => {
  assert.deepEqual(
    matchedComments(`Intro
// line note
Body /* block note */ tail
Trailing // note`),
    ['// line note', '/* block note */', '// note'],
  );
});

test('findJsStyleCommentRanges treats unterminated block comments as comments to the end', () => {
  assert.deepEqual(matchedComments('Before /* frozen note'), ['/* frozen note']);
});

test('findJsStyleCommentRanges avoids common URL false positives for line comments', () => {
  assert.deepEqual(matchedComments('See https://example.com/a // keep this note'), ['// keep this note']);
});

test('findJsStyleCommentRanges supports compact JavaScript-style line comments', () => {
  assert.deepEqual(matchedComments('return value;// compact note'), ['// compact note']);
});
