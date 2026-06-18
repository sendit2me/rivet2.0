import assert from 'node:assert/strict';
import test from 'node:test';
import { getLlmSelectorOptions } from './llmSelectorOptions.js';

test('getLlmSelectorOptions: None first, then entities sorted by label', () => {
  assert.deepEqual(
    getLlmSelectorOptions([
      { id: 'b', name: 'Beta' },
      { id: 'a', name: 'alpha' },
      { id: 'c', name: 'Gamma' },
    ]),
    [
      { label: 'None', value: '' },
      { label: 'alpha', value: 'a' },
      { label: 'Beta', value: 'b' },
      { label: 'Gamma', value: 'c' },
    ],
  );
});

test('getLlmSelectorOptions: empty Settings yields only None (byte-identical default)', () => {
  assert.deepEqual(getLlmSelectorOptions([]), [{ label: 'None', value: '' }]);
});

test('getLlmSelectorOptions: falls back to the id when an entity has no name', () => {
  assert.deepEqual(getLlmSelectorOptions([{ id: 'qwen-dev' }]), [
    { label: 'None', value: '' },
    { label: 'qwen-dev', value: 'qwen-dev' },
  ]);
});

test('getLlmSelectorOptions: a dangling selected id surfaces a Missing row (not blank)', () => {
  const options = getLlmSelectorOptions([{ id: 'a', name: 'Alpha' }], { selectedId: 'ghost' });
  assert.deepEqual(options, [
    { label: 'None', value: '' },
    { label: 'Missing: ghost', value: 'ghost' },
    { label: 'Alpha', value: 'a' },
  ]);
});

test('getLlmSelectorOptions: a selected id that exists does NOT add a Missing row', () => {
  const options = getLlmSelectorOptions([{ id: 'a', name: 'Alpha' }], { selectedId: 'a' });
  assert.deepEqual(options, [
    { label: 'None', value: '' },
    { label: 'Alpha', value: 'a' },
  ]);
});

test('getLlmSelectorOptions: no Missing row for an empty/None selection', () => {
  assert.deepEqual(getLlmSelectorOptions([{ id: 'a', name: 'Alpha' }], { selectedId: '' }), [
    { label: 'None', value: '' },
    { label: 'Alpha', value: 'a' },
  ]);
});
