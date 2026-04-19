import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isSplitSequentialFromSplitMode, splitModeFromIsSplitSequential } from './splitMode.js';

describe('splitMode mapping', () => {
  test('maps the existing sequential flag to the same visual choice', () => {
    assert.equal(splitModeFromIsSplitSequential(true), 'sequential');
    assert.equal(splitModeFromIsSplitSequential(false), 'parallel');
    assert.equal(splitModeFromIsSplitSequential(undefined), 'parallel');
  });

  test('maps the visual choice back to the same boolean flag', () => {
    assert.equal(isSplitSequentialFromSplitMode('sequential'), true);
    assert.equal(isSplitSequentialFromSplitMode('parallel'), false);
  });
});
