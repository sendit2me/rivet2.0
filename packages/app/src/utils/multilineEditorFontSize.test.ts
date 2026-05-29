import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustMultilineEditorFontSize,
  clampMultilineEditorFontSize,
  DEFAULT_MULTILINE_EDITOR_FONT_SIZE,
  getMultilineEditorFontSizeCommand,
  getMultilineEditorFontSizeWheelCommand,
  MAX_MULTILINE_EDITOR_FONT_SIZE,
  MIN_MULTILINE_EDITOR_FONT_SIZE,
} from './multilineEditorFontSize.js';

function createFontSizeKeyEvent(
  key: string,
  {
    code = '',
    ctrlKey = false,
    metaKey = false,
    altKey = false,
  }: {
    code?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
  },
) {
  return {
    key,
    code,
    ctrlKey,
    metaKey,
    altKey,
  };
}

describe('multilineEditorFontSize', () => {
  test('detects increase hotkeys for ctrl/meta plus variants', () => {
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('+', { ctrlKey: true })), 'increase');
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('=', { ctrlKey: true })), 'increase');
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('Add', { metaKey: true })), 'increase');
    assert.equal(
      getMultilineEditorFontSizeCommand({
        ...createFontSizeKeyEvent('Unidentified', { code: 'Equal', ctrlKey: true }),
      }),
      'increase',
    );
  });

  test('detects decrease hotkeys for ctrl/meta minus variants', () => {
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('-', { ctrlKey: true })), 'decrease');
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('_', { ctrlKey: true })), 'decrease');
    assert.equal(
      getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('Subtract', { metaKey: true })),
      'decrease',
    );
    assert.equal(
      getMultilineEditorFontSizeCommand({
        ...createFontSizeKeyEvent('Unidentified', { code: 'NumpadSubtract', ctrlKey: true }),
      }),
      'decrease',
    );
  });

  test('detects reset hotkey for ctrl/meta zero', () => {
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('0', { ctrlKey: true })), 'reset');
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('0', { metaKey: true })), 'reset');
    assert.equal(
      getMultilineEditorFontSizeCommand({
        ...createFontSizeKeyEvent('Unidentified', { code: 'Numpad0', ctrlKey: true }),
      }),
      'reset',
    );
  });

  test('ignores unrelated keys and missing modifiers', () => {
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('+', {})), undefined);
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('a', { code: 'KeyA', ctrlKey: true })), undefined);
    assert.equal(getMultilineEditorFontSizeCommand(createFontSizeKeyEvent('+', { ctrlKey: true, altKey: true })), undefined);
  });

  test('detects ctrl/meta wheel direction for font size changes', () => {
    assert.equal(
      getMultilineEditorFontSizeWheelCommand({ deltaY: -1, ctrlKey: true, metaKey: false, altKey: false }),
      'increase',
    );
    assert.equal(
      getMultilineEditorFontSizeWheelCommand({ deltaY: 1, ctrlKey: false, metaKey: true, altKey: false }),
      'decrease',
    );
    assert.equal(
      getMultilineEditorFontSizeWheelCommand({ deltaY: 0, ctrlKey: true, metaKey: false, altKey: false }),
      undefined,
    );
    assert.equal(
      getMultilineEditorFontSizeWheelCommand({ deltaY: -1, ctrlKey: false, metaKey: false, altKey: false }),
      undefined,
    );
    assert.equal(
      getMultilineEditorFontSizeWheelCommand({ deltaY: -1, ctrlKey: true, metaKey: false, altKey: true }),
      undefined,
    );
  });

  test('adjusts and clamps font size within the supported range', () => {
    assert.equal(adjustMultilineEditorFontSize(DEFAULT_MULTILINE_EDITOR_FONT_SIZE, 'increase'), 15);
    assert.equal(adjustMultilineEditorFontSize(DEFAULT_MULTILINE_EDITOR_FONT_SIZE, 'decrease'), 13);
    assert.equal(adjustMultilineEditorFontSize(22, 'reset'), DEFAULT_MULTILINE_EDITOR_FONT_SIZE);
    assert.equal(adjustMultilineEditorFontSize(MAX_MULTILINE_EDITOR_FONT_SIZE, 'increase'), MAX_MULTILINE_EDITOR_FONT_SIZE);
    assert.equal(adjustMultilineEditorFontSize(MIN_MULTILINE_EDITOR_FONT_SIZE, 'decrease'), MIN_MULTILINE_EDITOR_FONT_SIZE);
  });

  test('falls back to the default size when persisted values are invalid', () => {
    assert.equal(clampMultilineEditorFontSize(Number.NaN), DEFAULT_MULTILINE_EDITOR_FONT_SIZE);
    assert.equal(clampMultilineEditorFontSize(Number.POSITIVE_INFINITY), DEFAULT_MULTILINE_EDITOR_FONT_SIZE);
  });
});
