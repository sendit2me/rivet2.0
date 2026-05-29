import assert from 'node:assert/strict';
import test from 'node:test';
import { getTextEditorStats } from './textEditorStats.js';

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

test('getTextEditorStats returns display-ready counts for text editor status lines', () => {
  const stats = getTextEditorStats('abc def');

  assert.equal(stats.wordCount.toLocaleString(), '2');
  assert.equal(stats.characterCount.toLocaleString(), '7');
});
