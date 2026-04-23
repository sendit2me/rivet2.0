import assert from 'node:assert/strict';
import test from 'node:test';
import { getEditorListKey, getEditorRenderRows } from './editorUtils.js';

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

test('getEditorRenderRows groups consecutive inline editors', () => {
  const rows = getEditorRenderRows([
    { type: 'string', label: 'Name', dataKey: 'name' },
    { type: 'number', label: 'Min', dataKey: 'min', layout: 'inline' },
    { type: 'number', label: 'Max', dataKey: 'max', layout: 'inline' },
    { type: 'toggle', label: 'Enabled', dataKey: 'enabled' },
  ] as any);

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.type),
    ['single', 'inline', 'single'],
  );
  assert.deepEqual(rows[1], {
    type: 'inline',
    editors: [
      { type: 'number', label: 'Min', dataKey: 'min', layout: 'inline' },
      { type: 'number', label: 'Max', dataKey: 'max', layout: 'inline' },
    ],
    startIndex: 1,
    key: 'inline-number:min',
  });
});
