import assert from 'node:assert/strict';
import test from 'node:test';
import { lineCrossesViewport, type LineClipRect } from './lineClipping.js';

const clipRect: LineClipRect = {
  left: 100,
  top: 50,
  right: 500,
  bottom: 350,
};

test('lineCrossesViewport accepts a line inside a non-zero viewport rectangle', () => {
  assert.equal(lineCrossesViewport({ x: 120, y: 100 }, { x: 480, y: 300 }, clipRect), true);
});

test('lineCrossesViewport accepts a line crossing a non-zero viewport rectangle', () => {
  assert.equal(lineCrossesViewport({ x: 0, y: 200 }, { x: 700, y: 200 }, clipRect), true);
});

test('lineCrossesViewport rejects a line outside the same viewport side', () => {
  assert.equal(lineCrossesViewport({ x: 0, y: 20 }, { x: 700, y: 20 }, clipRect), false);
});

test('lineCrossesViewport accepts a vertical line crossing the rectangle', () => {
  assert.equal(lineCrossesViewport({ x: 250, y: 0 }, { x: 250, y: 500 }, clipRect), true);
});
