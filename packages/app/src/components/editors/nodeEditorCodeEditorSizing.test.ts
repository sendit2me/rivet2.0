import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_NODE_CODE_EDITOR_VIEWPORT_HEIGHT,
  MIN_NODE_CODE_EDITOR_VIEWPORT_HEIGHT,
  clampNodeCodeEditorViewportHeight,
  getDraggedNodeCodeEditorViewportHeight,
  isResizableNodeCodeEditorLanguage,
  resolveResizableNodeCodeEditorViewportHeight,
} from './nodeEditorCodeEditorSizing.js';

test('isResizableNodeCodeEditorLanguage only enables javascript and json', () => {
  assert.equal(isResizableNodeCodeEditorLanguage('javascript'), true);
  assert.equal(isResizableNodeCodeEditorLanguage('json'), true);
  assert.equal(isResizableNodeCodeEditorLanguage('markdown'), false);
  assert.equal(isResizableNodeCodeEditorLanguage('prompt-interpolation-markdown'), false);
  assert.equal(isResizableNodeCodeEditorLanguage('jsonpath'), false);
  assert.equal(isResizableNodeCodeEditorLanguage('regex'), false);
  assert.equal(isResizableNodeCodeEditorLanguage('plaintext'), false);
  assert.equal(isResizableNodeCodeEditorLanguage(undefined), false);
});

test('resolveResizableNodeCodeEditorViewportHeight prefers persisted height for resizable editors', () => {
  const height = resolveResizableNodeCodeEditorViewportHeight({
    nodeType: 'httpCall',
    editorHeight: 320,
    persistedHeights: {
      httpCall: 640,
    },
  });

  assert.equal(height, 640);
});

test('resolveResizableNodeCodeEditorViewportHeight falls back to editor height for resizable editors', () => {
  const height = resolveResizableNodeCodeEditorViewportHeight({
    nodeType: 'code',
    editorHeight: 420,
    persistedHeights: {},
  });

  assert.equal(height, 420);
});

test('resolveResizableNodeCodeEditorViewportHeight falls back to default height for resizable editors', () => {
  const height = resolveResizableNodeCodeEditorViewportHeight({
    nodeType: 'object',
    editorHeight: undefined,
    persistedHeights: {},
  });

  assert.equal(height, DEFAULT_NODE_CODE_EDITOR_VIEWPORT_HEIGHT);
});

test('resolveResizableNodeCodeEditorViewportHeight ignores invalid persisted heights', () => {
  const height = resolveResizableNodeCodeEditorViewportHeight({
    nodeType: 'tool',
    editorHeight: 360,
    persistedHeights: {
      tool: Number.NaN,
    },
  });

  assert.equal(height, 360);
});

test('clampNodeCodeEditorViewportHeight enforces the minimum height', () => {
  assert.equal(clampNodeCodeEditorViewportHeight(MIN_NODE_CODE_EDITOR_VIEWPORT_HEIGHT - 50), MIN_NODE_CODE_EDITOR_VIEWPORT_HEIGHT);
  assert.equal(clampNodeCodeEditorViewportHeight(MIN_NODE_CODE_EDITOR_VIEWPORT_HEIGHT + 25), MIN_NODE_CODE_EDITOR_VIEWPORT_HEIGHT + 25);
});

test('getDraggedNodeCodeEditorViewportHeight applies drag delta and clamps at the minimum', () => {
  assert.equal(
    getDraggedNodeCodeEditorViewportHeight({
      startHeight: 500,
      startClientY: 100,
      currentClientY: 180,
    }),
    580,
  );

  assert.equal(
    getDraggedNodeCodeEditorViewportHeight({
      startHeight: 250,
      startClientY: 100,
      currentClientY: -100,
    }),
    MIN_NODE_CODE_EDITOR_VIEWPORT_HEIGHT,
  );
});
