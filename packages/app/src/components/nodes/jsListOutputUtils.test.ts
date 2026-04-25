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
      ['factor' as PortId]: { type: 'number', value: 3 },
    }),
    `(item, index, array) => {
  return item * 3;
}`,
  );
});

test('getParsedJSListCallbackPreviewSource renders value-backed snippets like Expression', () => {
  assert.equal(
    getParsedJSListCallbackPreviewSource('return {{prefix}} + item + {{config}}.suffix + {{items}}[0];', {
      ['prefix' as PortId]: { type: 'string', value: 'item-' },
      ['config' as PortId]: { type: 'object', value: { suffix: '-done' } },
      ['items' as PortId]: { type: 'any[]', value: ['first'] },
    }),
    `(item, index, array) => {
  return "item-" + item + config.suffix + items[0];
}`,
  );
});
