import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_HEIGHT, isValidHeight, MIN_HEIGHT, RESIZABLE_LANGUAGES } from './useNodeEditorCodeViewportHeight.js';

function resolveViewportHeight({
  nodeType,
  defaultHeight,
  persistedHeights,
}: {
  nodeType: string | undefined;
  defaultHeight: number | undefined;
  persistedHeights: Record<string, number>;
}): number {
  const persistedHeight = nodeType ? persistedHeights[nodeType] : undefined;
  return isValidHeight(persistedHeight)
    ? Math.max(MIN_HEIGHT, Math.round(persistedHeight))
    : isValidHeight(defaultHeight)
      ? Math.max(MIN_HEIGHT, Math.round(defaultHeight))
      : DEFAULT_HEIGHT;
}

function dragViewportHeight(startHeight: number, startClientY: number, currentClientY: number): number {
  return Math.max(MIN_HEIGHT, Math.round(startHeight + (currentClientY - startClientY)));
}

test('resolveViewportHeight prefers persisted height and falls back through default height to the shared default', () => {
  assert.equal(resolveViewportHeight({ nodeType: 'httpCall', defaultHeight: 320, persistedHeights: { httpCall: 640 } }), 640);
  assert.equal(resolveViewportHeight({ nodeType: 'code', defaultHeight: 420, persistedHeights: {} }), 420);
  assert.equal(resolveViewportHeight({ nodeType: 'object', defaultHeight: undefined, persistedHeights: {} }), DEFAULT_HEIGHT);
});

test('resolveViewportHeight ignores invalid persisted heights', () => {
  assert.equal(resolveViewportHeight({ nodeType: 'tool', defaultHeight: 360, persistedHeights: { tool: Number.NaN } }), 360);
});

test('dragViewportHeight clamps to the minimum height', () => {
  assert.equal(dragViewportHeight(500, 100, 180), 580);
  assert.equal(dragViewportHeight(250, 100, -100), MIN_HEIGHT);
});

test('resizable node-editor languages include text-node prompt interpolation', () => {
  assert.equal(RESIZABLE_LANGUAGES.has('javascript'), true);
  assert.equal(RESIZABLE_LANGUAGES.has('json'), true);
  assert.equal(RESIZABLE_LANGUAGES.has('prompt-interpolation-markdown'), true);
});
