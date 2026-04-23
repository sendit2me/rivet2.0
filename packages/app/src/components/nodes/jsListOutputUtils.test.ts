import assert from 'node:assert/strict';
import test from 'node:test';
import { JSMapNodeImpl, type PortId } from '@ironclad/rivet-core';
import {
  getJSListCallbackPreviewSource,
  getParsedJSListCallbackPreviewSource,
  hasJSListCallbackInterpolationInputs,
} from './jsListOutputUtils.js';

test('getJSListCallbackPreviewSource prefers the stored execution snapshot over current node data', () => {
  const node = {
    ...JSMapNodeImpl.create(),
    data: {
      callbackBody: 'return item * {{currentFactor}};',
    },
  };

  const previewSource = getJSListCallbackPreviewSource(node, {
    debugData: {
      jsListCallbackBodySource: 'return item * {{runFactor}};',
    },
  });

  assert.equal(previewSource, 'return item * {{runFactor}};');
});

test('hasJSListCallbackInterpolationInputs ignores callback locals and escaped tokens', () => {
  assert.equal(hasJSListCallbackInterpolationInputs('return item * {{factor}};'), true);
  assert.equal(hasJSListCallbackInterpolationInputs('return item;'), false);
  assert.equal(hasJSListCallbackInterpolationInputs('return {{item}} + {{index}} + {{array}};'), false);
  assert.equal(hasJSListCallbackInterpolationInputs('return "{{{literal}}}";'), false);
});

test('getParsedJSListCallbackPreviewSource renders the substituted callback shape', () => {
  assert.equal(
    getParsedJSListCallbackPreviewSource('return item * {{factor}};', {
      ['factor' as PortId]: { type: 'string', value: '3' },
    }),
    `(item, index, array) => {
  return item * 3;
}`,
  );
});
