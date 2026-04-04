import assert from 'node:assert/strict';
import test from 'node:test';
import { getPortCompatibilityStatus } from './portCompatibility.js';

test('getPortCompatibilityStatus returns none when the port data type is unavailable', () => {
  assert.equal(
    getPortCompatibilityStatus({
      draggingDataType: 'string',
      portDataType: undefined,
      canCoerce: true,
      isInput: true,
    }),
    'none',
  );
});

test('getPortCompatibilityStatus reports coerced compatibility when coercion is allowed', () => {
  assert.equal(
    getPortCompatibilityStatus({
      draggingDataType: 'number[]',
      portDataType: 'string',
      canCoerce: true,
      isInput: true,
    }),
    'coerced',
  );
});

test('getPortCompatibilityStatus reports incompatibility when coercion is not allowed', () => {
  assert.equal(
    getPortCompatibilityStatus({
      draggingDataType: 'binary',
      portDataType: 'string',
      canCoerce: false,
      isInput: true,
    }),
    'incompatible',
  );
});
