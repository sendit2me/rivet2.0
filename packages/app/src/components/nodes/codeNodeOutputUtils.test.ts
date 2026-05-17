import assert from 'node:assert/strict';
import test from 'node:test';
import { getCodeNodeErrorLineHighlight, parseCodeNodeError } from './codeNodeOutputUtils.js';
import { type ProcessId } from '@valerypopoff/rivet2-core';
import { type ProcessDataForNode } from '../../state/dataFlow.js';

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

test('parseCodeNodeError supports previous Code new node locations', () => {
  assert.deepEqual(parseCodeNodeError('ReferenceError: foo is not defined (Code new node line 4, column 8)'), {
    location: {
      column: 8,
      line: 4,
    },
    message: 'ReferenceError: foo is not defined',
  });
});

test('parseCodeNodeError supports Code legacy node locations', () => {
  assert.deepEqual(parseCodeNodeError('ReferenceError: foo is not defined (Code (legacy) node line 4, column 8)'), {
    location: {
      column: 8,
      line: 4,
    },
    message: 'ReferenceError: foo is not defined',
  });
});

test('parseCodeNodeError leaves unrelated errors unchanged', () => {
  assert.deepEqual(parseCodeNodeError('Dynamic code execution is disabled.'), {
    message: 'Dynamic code execution is disabled.',
  });
});

test('parseCodeNodeError rejects invalid location values', () => {
  assert.deepEqual(parseCodeNodeError('ReferenceError: foo is not defined (Code node line 0, column 16)'), {
    message: 'ReferenceError: foo is not defined (Code node line 0, column 16)',
  });

  assert.deepEqual(parseCodeNodeError('ReferenceError: foo is not defined (Code node line 6, column 0)'), {
    message: 'ReferenceError: foo is not defined (Code node line 6, column 0)',
  });
});

test('getCodeNodeErrorLineHighlight returns a line highlight for a selected code error run', () => {
  const processData = {
    processId: 'selected' as ProcessId,
    data: {
      debugData: {
        codeSource: 'const value = selectedMissing;',
      },
      status: {
        type: 'error',
        error: 'ReferenceError: selectedMissing is not defined (Code node line 1, column 15)',
      },
    },
  } satisfies ProcessDataForNode;

  assert.deepEqual(getCodeNodeErrorLineHighlight(processData), {
    line: 1,
    runKey: 'selected',
    source: 'const value = selectedMissing;',
  });
});

test('getCodeNodeErrorLineHighlight ignores non-error runs', () => {
  const processData = {
    processId: 'success' as ProcessId,
    data: {
      debugData: {
        codeSource: 'return {};',
      },
      status: {
        type: 'ok',
      },
    },
  } satisfies ProcessDataForNode;

  assert.equal(getCodeNodeErrorLineHighlight(processData), undefined);
});
