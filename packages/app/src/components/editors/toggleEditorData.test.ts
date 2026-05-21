import assert from 'node:assert/strict';
import test from 'node:test';
import { applyToggleEditorChange, type ToggleEditorDataChangeDefinition } from './toggleEditorData.js';

const editor = {
  dataKey: 'onDemand',
  turnOffDataKeysWhenEnabled: ['wait'],
} satisfies ToggleEditorDataChangeDefinition;

test('applyToggleEditorChange turns configured peer toggles off when enabling', () => {
  assert.deepEqual(applyToggleEditorChange({ onDemand: false, wait: true }, editor, true), {
    onDemand: true,
    wait: false,
  });
});

test('applyToggleEditorChange leaves peer toggles alone when disabling', () => {
  assert.deepEqual(applyToggleEditorChange({ onDemand: true, wait: false }, editor, false), {
    onDemand: false,
    wait: false,
  });
});
