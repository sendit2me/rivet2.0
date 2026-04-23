import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldOpenNodeSettingsOnCreate } from './settings.js';

test('shouldOpenNodeSettingsOnCreate defaults to enabled when the setting is missing', () => {
  assert.equal(shouldOpenNodeSettingsOnCreate(undefined), true);
  assert.equal(shouldOpenNodeSettingsOnCreate({}), true);
});

test('shouldOpenNodeSettingsOnCreate respects explicit values', () => {
  assert.equal(shouldOpenNodeSettingsOnCreate({ openNodeSettingsOnCreate: true }), true);
  assert.equal(shouldOpenNodeSettingsOnCreate({ openNodeSettingsOnCreate: false }), false);
});
