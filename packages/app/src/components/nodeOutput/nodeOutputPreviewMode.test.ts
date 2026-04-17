import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNodeOutputPreviewMode } from './nodeOutputPreviewMode.js';

test('resolveNodeOutputPreviewMode keeps regular node output compact when full output is collapsed', () => {
  assert.deepEqual(resolveNodeOutputPreviewMode(false), {
    isCompact: true,
    renderMode: 'compact',
  });
});

test('resolveNodeOutputPreviewMode uses full render mode when node output is expanded', () => {
  assert.deepEqual(resolveNodeOutputPreviewMode(true), {
    isCompact: false,
    renderMode: 'full',
  });
});
