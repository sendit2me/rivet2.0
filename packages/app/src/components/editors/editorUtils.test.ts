import assert from 'node:assert/strict';
import test from 'node:test';
import { getEditorListKey } from './editorUtils.js';

test('getEditorListKey uses dataKey for standard editors', () => {
  assert.equal(
    getEditorListKey(
      {
        type: 'code',
        label: '',
        dataKey: 'code',
        language: 'javascript',
      } as any,
      0,
    ),
    'code:code',
  );
});

test('getEditorListKey uses customEditorId for custom editors without a dataKey', () => {
  assert.equal(
    getEditorListKey(
      {
        type: 'custom',
        label: 'AI Assist',
        customEditorId: 'CodeNodeAIAssist',
      } as any,
      0,
    ),
    'custom:CodeNodeAIAssist',
  );
});

test('getEditorListKey falls back to label plus index for non-dataKey editors', () => {
  assert.equal(
    getEditorListKey(
      {
        type: 'group',
        label: 'Runtime Permissions',
        editors: [],
      } as any,
      2,
    ),
    'group:Runtime Permissions:2',
  );
});
