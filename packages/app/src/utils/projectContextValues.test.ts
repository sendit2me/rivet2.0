import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataValue } from '@valerypopoff/rivet2-core';
import { getProjectContextValues } from './projectContextValues';

test('getProjectContextValues unwraps stored project context values', () => {
  const storedSecretValue: DataValue = { type: 'string', value: 'token' };
  const storedObjectValue: DataValue = { type: 'object', value: { nested: { label: 'value' } } };
  const contextValues = getProjectContextValues({
    secret: { value: storedSecretValue, secret: true },
    object: { value: storedObjectValue, secret: false },
    visible: { value: { type: 'number', value: 3 }, secret: false },
  });

  assert.deepEqual(contextValues, {
    secret: { type: 'string', value: 'token' },
    object: { type: 'object', value: { nested: { label: 'value' } } },
    visible: { type: 'number', value: 3 },
  });
  assert.notEqual(contextValues.secret, storedSecretValue);

  const unwrappedObjectValue = contextValues.object as Extract<DataValue, { type: 'object' }>;
  const sourceObjectValue = storedObjectValue as Extract<DataValue, { type: 'object' }>;

  assert.notEqual(unwrappedObjectValue, sourceObjectValue);
  assert.notEqual(unwrappedObjectValue.value.nested, sourceObjectValue.value.nested);
});
