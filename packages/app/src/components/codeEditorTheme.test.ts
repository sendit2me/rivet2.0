import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMonacoTheme } from './codeEditorTheme.js';

test('resolveMonacoTheme expands prompt-interpolation themes with the active app theme', () => {
  assert.equal(resolveMonacoTheme('prompt-interpolation', 'molten'), 'prompt-interpolation-molten');
  assert.equal(resolveMonacoTheme('vs-dark', 'molten'), 'vs-dark');
  assert.equal(resolveMonacoTheme(undefined, 'molten'), undefined);
});
