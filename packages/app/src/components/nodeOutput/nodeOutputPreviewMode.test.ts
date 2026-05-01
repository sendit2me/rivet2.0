import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNodeOutputPreviewMode } from './nodeOutputPreviewMode.js';

test('resolveNodeOutputPreviewMode keeps regular node output compact when full output is collapsed', () => {
  assert.deepEqual(resolveNodeOutputPreviewMode({ isOutputExpanded: false }), {
    isCompact: true,
    renderMode: 'compact',
  });
});

test('resolveNodeOutputPreviewMode uses expanded-preview mode on hover when full output is collapsed', () => {
  assert.deepEqual(resolveNodeOutputPreviewMode({ isOutputExpanded: false, isHovered: true }), {
    isCompact: false,
    renderMode: 'expanded-preview',
  });
});

test('resolveNodeOutputPreviewMode uses full render mode when node output is expanded', () => {
  assert.deepEqual(resolveNodeOutputPreviewMode({ isOutputExpanded: true, isHovered: true }), {
    isCompact: false,
    renderMode: 'full',
  });
});
