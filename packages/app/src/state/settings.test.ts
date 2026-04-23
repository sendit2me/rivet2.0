import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEditorPreferences } from './settings.js';

test('resolveEditorPreferences applies editor defaults when settings are missing', () => {
  assert.deepEqual(resolveEditorPreferences(undefined), {
    applyDefaultNodeColors: false,
    openNodeSettingsOnCreate: true,
  });
  assert.deepEqual(resolveEditorPreferences({}), {
    applyDefaultNodeColors: false,
    openNodeSettingsOnCreate: true,
  });
});

test('resolveEditorPreferences respects explicit editor settings', () => {
  assert.deepEqual(
    resolveEditorPreferences({
      defaultNodeColors: true,
      openNodeSettingsOnCreate: false,
    }),
    {
      applyDefaultNodeColors: true,
      openNodeSettingsOnCreate: false,
    },
  );
});
