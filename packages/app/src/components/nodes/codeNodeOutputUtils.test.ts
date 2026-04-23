import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCodeNodeError } from './codeNodeOutputUtils.js';

test('parseCodeNodeError separates the user error from the code-node location', () => {
  assert.deepEqual(parseCodeNodeError('ReferenceError: foo is not defined (Code node line 6, column 16)'), {
    location: {
      column: 16,
      line: 6,
    },
    message: 'ReferenceError: foo is not defined',
  });
});

test('parseCodeNodeError supports line-only locations', () => {
  assert.deepEqual(parseCodeNodeError('SyntaxError: Unexpected token (Code node line 3)'), {
    location: {
      column: undefined,
      line: 3,
    },
    message: 'SyntaxError: Unexpected token',
  });
});

test('parseCodeNodeError leaves unrelated errors unchanged', () => {
  assert.deepEqual(parseCodeNodeError('Dynamic code execution is disabled.'), {
    message: 'Dynamic code execution is disabled.',
  });
});
