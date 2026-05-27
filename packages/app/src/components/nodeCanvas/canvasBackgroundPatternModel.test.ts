import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCanvasBackgroundPatternDots,
  getCanvasBackgroundPatternOpacity,
  getCanvasBackgroundPatternTileOffset,
  getCanvasBackgroundPatternTileSize,
} from './canvasBackgroundPatternModel.js';

test('canvas background pattern opacity is shared by all pattern variants', () => {
  assert.equal(getCanvasBackgroundPatternOpacity(0.02), 0.02);
  assert.equal(getCanvasBackgroundPatternOpacity(0.12), 0.12);
});

test('canvas background pattern tile metrics follow panned and zoomed canvas coordinates', () => {
  assert.equal(getCanvasBackgroundPatternTileSize({ zoom: 1 }), 20);
  assert.equal(getCanvasBackgroundPatternTileSize({ zoom: 1.5 }), 30);
  assert.equal(getCanvasBackgroundPatternTileOffset(7, 20), 7);
  assert.equal(getCanvasBackgroundPatternTileOffset(-3, 20), 17);
  assert.equal(getCanvasBackgroundPatternTileOffset(Number.NaN, 20), 0);
});

test('dot and cross patterns use literal pixel dots', () => {
  assert.deepEqual(getCanvasBackgroundPatternDots('grid'), []);
  assert.deepEqual(getCanvasBackgroundPatternDots('dots'), [{ dx: -1, dy: -1, size: 2 }]);
  assert.deepEqual(getCanvasBackgroundPatternDots('crosses'), [
    { dx: 0, dy: 0, size: 1 },
    { dx: 1, dy: 0, size: 1 },
    { dx: 2, dy: 0, size: 1 },
    { dx: 3, dy: 0, size: 1 },
    { dx: -1, dy: 0, size: 1 },
    { dx: -2, dy: 0, size: 1 },
    { dx: -3, dy: 0, size: 1 },
    { dx: 0, dy: 1, size: 1 },
    { dx: 0, dy: 2, size: 1 },
    { dx: 0, dy: 3, size: 1 },
    { dx: 0, dy: -1, size: 1 },
    { dx: 0, dy: -2, size: 1 },
    { dx: 0, dy: -3, size: 1 },
  ]);
});
