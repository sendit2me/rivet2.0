import assert from 'node:assert/strict';
import test from 'node:test';
import { ExpressionNodeImpl, interpolateExpressionSource, type Inputs, type PortId } from '@ironclad/rivet-core';
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

test('interpolateExpressionSource shows primitive values as JavaScript literals', () => {
  const inputs: Inputs = {
    ['text' as PortId]: { type: 'string', value: 'foo' },
    ['number' as PortId]: { type: 'number', value: 1 },
    ['bool' as PortId]: { type: 'boolean', value: true },
    ['nil' as PortId]: { type: 'any', value: null },
  };

  assert.equal(
    interpolateExpressionSource('{{text}} + {{number}} + {{bool}} + {{nil}} + {{missing}}', inputs),
    '"foo" + 1 + true + null + undefined',
  );
});

test('interpolateExpressionSource shows arrays and objects as variable names', () => {
  const inputs: Inputs = {
    ['array' as PortId]: { type: 'any[]', value: ['foo', 'bar'] },
    ['object' as PortId]: { type: 'object', value: { field: 'value' } },
  };

  assert.equal(interpolateExpressionSource('{{array}}[0] ?? {{object}}.field', inputs), 'array[0] ?? object.field');
});
