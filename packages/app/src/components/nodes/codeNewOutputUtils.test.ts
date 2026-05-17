import assert from 'node:assert/strict';
import test from 'node:test';
import { CodeNewNodeImpl, type Inputs, type PortId } from '@valerypopoff/rivet2-core';
import {
  getCodeNewParsedSource,
  getCodeNewPreviewSource,
  hasCodeNewInterpolationInputs,
} from './codeNewOutputUtils.js';

test('getCodeNewPreviewSource prefers the stored execution snapshot over the current node code', () => {
  const node = {
    ...CodeNewNodeImpl.create(),
    data: {
      ...CodeNewNodeImpl.create().data,
      code: 'return {{a}} + 1;',
    },
  };

  const previewSource = getCodeNewPreviewSource(node, {
    debugData: {
      codeSource: 'return {{a}} * 2;',
    },
  });

  assert.equal(previewSource, 'return {{a}} * 2;');
});

test('getCodeNewPreviewSource falls back to the current node code when no snapshot is stored', () => {
  const node = {
    ...CodeNewNodeImpl.create(),
    data: {
      ...CodeNewNodeImpl.create().data,
      code: 'return {{a}} + 1;',
    },
  };

  const previewSource = getCodeNewPreviewSource(node, {});

  assert.equal(previewSource, 'return {{a}} + 1;');
});

test('hasCodeNewInterpolationInputs returns true only for interpolation-created ports', () => {
  assert.equal(hasCodeNewInterpolationInputs('return {{a}} + 1;'), true);
  assert.equal(hasCodeNewInterpolationInputs('return 1 + 2;'), false);
  assert.equal(hasCodeNewInterpolationInputs('return "{{{escaped}}}";'), false);
  assert.equal(hasCodeNewInterpolationInputs('return {{broken + {{a}};'), true);
});

test('getCodeNewParsedSource shows primitive values as JavaScript literals', () => {
  const node = {
    ...CodeNewNodeImpl.create(),
    data: {
      ...CodeNewNodeImpl.create().data,
      code: 'return {{text}} + {{number}} + {{bool}} + {{nil}} + {{missing}};',
    },
  };
  const inputs: Inputs = {
    ['text' as PortId]: { type: 'string', value: 'foo' },
    ['number' as PortId]: { type: 'number', value: 1 },
    ['bool' as PortId]: { type: 'boolean', value: true },
    ['nil' as PortId]: { type: 'any', value: null },
  };

  assert.equal(
    getCodeNewParsedSource(node, {}, inputs),
    'return "foo" + 1 + true + null + undefined;',
  );
});

test('getCodeNewParsedSource preserves code whitespace around interpolation', () => {
  const node = {
    ...CodeNewNodeImpl.create(),
    data: {
      ...CodeNewNodeImpl.create().data,
      code: '\n  const value = {{value}};\n  return value;\n',
    },
  };

  assert.equal(
    getCodeNewParsedSource(node, {}, { ['value' as PortId]: { type: 'number', value: 42 } }),
    '\n  const value = 42;\n  return value;\n',
  );
});
