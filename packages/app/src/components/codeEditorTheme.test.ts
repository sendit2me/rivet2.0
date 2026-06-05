import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MONACO_THEME,
  resolveMonacoDisplayTheme,
  resolveMonacoForeground,
  resolveMonacoTheme,
} from './codeEditorTheme.js';

test('resolveMonacoTheme expands prompt-interpolation themes with the active app theme', () => {
  assert.equal(resolveMonacoTheme('prompt-interpolation', 'molten'), 'prompt-interpolation-molten');
  assert.equal(resolveMonacoTheme('prompt-interpolation', 'custom'), 'prompt-interpolation-custom');
  assert.equal(resolveMonacoTheme('vs-dark', 'molten'), 'vs-dark');
  assert.equal(resolveMonacoTheme(undefined, 'molten'), undefined);
});

test('resolveMonacoDisplayTheme falls back to the default editor theme', () => {
  assert.equal(resolveMonacoDisplayTheme(undefined, 'molten'), DEFAULT_MONACO_THEME);
  assert.equal(resolveMonacoDisplayTheme('prompt-interpolation', 'molten'), 'prompt-interpolation-molten');
  assert.equal(resolveMonacoDisplayTheme('prompt-interpolation', 'custom'), 'prompt-interpolation-custom');
});

test('resolveMonacoForeground matches the editor default foreground for dark Monaco themes', () => {
  assert.equal(resolveMonacoForeground(undefined, 'molten'), '#d4d4d4');
  assert.equal(resolveMonacoForeground('vs-dark', 'molten'), '#d4d4d4');
  assert.equal(resolveMonacoForeground('prompt-interpolation', 'molten'), '#d4d4d4');
});
