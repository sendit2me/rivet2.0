import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJsonObjectInput } from './JsonObjectField.js';

test('empty / whitespace clears the value (inherit / none)', () => {
  assert.deepEqual(parseJsonObjectInput(''), { kind: 'empty' });
  assert.deepEqual(parseJsonObjectInput('   \n  '), { kind: 'empty' });
});

test('a valid JSON object commits the parsed value', () => {
  assert.deepEqual(parseJsonObjectInput('{"chat_template_kwargs": {"enable_thinking": false}}'), {
    kind: 'object',
    value: { chat_template_kwargs: { enable_thinking: false } },
  });
});

test('invalid JSON is an error and is NOT committed', () => {
  const result = parseJsonObjectInput('{ not valid');
  assert.equal(result.kind, 'error');
});

test('a non-object (array / scalar) is an error and is NOT committed', () => {
  assert.equal(parseJsonObjectInput('[1, 2, 3]').kind, 'error');
  assert.equal(parseJsonObjectInput('42').kind, 'error');
  assert.equal(parseJsonObjectInput('"a string"').kind, 'error');
  assert.equal(parseJsonObjectInput('null').kind, 'error');
});
