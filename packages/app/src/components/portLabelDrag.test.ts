import assert from 'node:assert/strict';
import test from 'node:test';
import { canStartWireDragFromPortLabel } from './Port.js';

test('canStartWireDragFromPortLabel only allows wire starts from output labels', () => {
  assert.equal(canStartWireDragFromPortLabel(false), true);
  assert.equal(canStartWireDragFromPortLabel(true), false);
});
