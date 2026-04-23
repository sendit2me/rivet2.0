import assert from 'node:assert/strict';
import test from 'node:test';
import { ExpressionNodeImpl } from '@ironclad/rivet-core';
import { getExpressionPreviewSource, hasExpressionInterpolationInputs } from './expressionOutputUtils.js';

test('getExpressionPreviewSource prefers the stored execution snapshot over the current node expression', () => {
  const node = {
    ...ExpressionNodeImpl.create(),
    data: {
      expression: '{{a}} + 1',
    },
  };

  const previewSource = getExpressionPreviewSource(node, {
    debugData: {
      expressionSource: '{{a}} * 2',
    },
  });

  assert.equal(previewSource, '{{a}} * 2');
});

test('getExpressionPreviewSource falls back to the current node expression when no snapshot is stored', () => {
  const node = {
    ...ExpressionNodeImpl.create(),
    data: {
      expression: '{{a}} + 1',
    },
  };

  const previewSource = getExpressionPreviewSource(node, {});

  assert.equal(previewSource, '{{a}} + 1');
});

test('hasExpressionInterpolationInputs returns true only for interpolation-created ports', () => {
  assert.equal(hasExpressionInterpolationInputs('{{a}} + 1'), true);
  assert.equal(hasExpressionInterpolationInputs('1 + 2'), false);
  assert.equal(hasExpressionInterpolationInputs('{{{escaped}}} + 1'), false);
  assert.equal(hasExpressionInterpolationInputs('{{broken + {{a}}'), true);
});
