import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  DEFAULT_HORIZONTAL_MODAL_BOUNDS,
  normalizeHorizontalModalBounds,
  resizeHorizontalModalBounds,
} from './fullScreenModalBounds.js';

describe('fullScreenModalBounds', () => {
  test('uses default bounds when stored bounds are missing', () => {
    assert.deepEqual(normalizeHorizontalModalBounds(undefined, 1200), DEFAULT_HORIZONTAL_MODAL_BOUNDS);
  });

  test('uses default bounds when stored bounds are corrupted', () => {
    assert.deepEqual(normalizeHorizontalModalBounds(null, 1200), DEFAULT_HORIZONTAL_MODAL_BOUNDS);
    assert.deepEqual(normalizeHorizontalModalBounds('wide' as never, 1200), DEFAULT_HORIZONTAL_MODAL_BOUNDS);
  });

  test('normalizes default bounds for very narrow viewports', () => {
    assert.deepEqual(normalizeHorizontalModalBounds(undefined, 320), {
      leftPercent: 0,
      rightPercent: 0,
    });
  });

  test('normalizes invalid or overflowing stored bounds', () => {
    assert.deepEqual(normalizeHorizontalModalBounds({ leftPercent: Number.NaN, rightPercent: 120 }, 1000), {
      leftPercent: 4.64,
      rightPercent: 59.36,
    });
  });

  test('resizes the left edge while keeping the right edge fixed', () => {
    assert.deepEqual(
      resizeHorizontalModalBounds({
        bounds: { leftPercent: 5, rightPercent: 10 },
        clientX: 240,
        edge: 'left',
        viewportWidth: 1200,
      }),
      { leftPercent: 20, rightPercent: 10 },
    );
  });

  test('resizes safely when stored bounds are corrupted', () => {
    assert.deepEqual(
      resizeHorizontalModalBounds({
        bounds: null,
        clientX: 240,
        edge: 'left',
        viewportWidth: 1200,
      }),
      { leftPercent: 20, rightPercent: 5 },
    );
  });

  test('resizes the right edge while keeping the left edge fixed', () => {
    assert.deepEqual(
      resizeHorizontalModalBounds({
        bounds: { leftPercent: 15, rightPercent: 5 },
        clientX: 840,
        edge: 'right',
        viewportWidth: 1200,
      }),
      { leftPercent: 15, rightPercent: 30 },
    );
  });

  test('keeps a usable minimum modal width', () => {
    assert.deepEqual(
      resizeHorizontalModalBounds({
        bounds: { leftPercent: 10, rightPercent: 10 },
        clientX: 950,
        edge: 'left',
        viewportWidth: 1000,
      }),
      { leftPercent: 54, rightPercent: 10 },
    );
  });
});
