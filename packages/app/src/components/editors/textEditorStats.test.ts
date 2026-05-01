import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTextEditorStatsLine, getTextEditorStats } from './textEditorStats.js';

test('getTextEditorStats counts words by whitespace-delimited tokens and counts all characters', () => {
  assert.deepEqual(getTextEditorStats('Hello world\nfrom Rivet'), {
    wordCount: 4,
    characterCount: 22,
  });
});

test('getTextEditorStats ignores repeated whitespace for words but still counts it as characters', () => {
  assert.deepEqual(getTextEditorStats('  alpha   beta  '), {
    wordCount: 2,
    characterCount: 16,
  });
});

test('formatTextEditorStatsLine formats the status line for the text node editor', () => {
  assert.equal(formatTextEditorStatsLine('abc def'), 'Words: 2  Characters: 7');
});
