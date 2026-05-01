import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeBoxNodeResizeBounds,
  computeHorizontalNodeResizeBounds,
  haveHorizontalNodeResizeBoundsChanged,
  MIN_NODE_WIDTH,
} from './nodeResize.js';

test('computeHorizontalNodeResizeBounds expands from the right edge without moving x', () => {
  const resized = computeHorizontalNodeResizeBounds({
    direction: 'right',
    initialWidth: 300,
    initialX: 120,
    deltaX: 40,
  });

  assert.deepEqual(resized, {
    x: 120,
    width: 340,
  });
});

test('computeHorizontalNodeResizeBounds shrinks from the left edge and preserves the right edge', () => {
  const resized = computeHorizontalNodeResizeBounds({
    direction: 'left',
    initialWidth: 300,
    initialX: 120,
    deltaX: 40,
  });

  assert.deepEqual(resized, {
    x: 160,
    width: 260,
  });
});

test('computeHorizontalNodeResizeBounds clamps left-edge resize at the minimum width', () => {
  const resized = computeHorizontalNodeResizeBounds({
    direction: 'left',
    initialWidth: 300,
    initialX: 120,
    deltaX: 260,
  });

  assert.deepEqual(resized, {
    x: 120 + (300 - MIN_NODE_WIDTH),
    width: MIN_NODE_WIDTH,
  });
});

test('computeHorizontalNodeResizeBounds preserves the right edge for subpixel left-edge resizes', () => {
  const resized = computeHorizontalNodeResizeBounds({
    direction: 'left',
    initialWidth: 300.5,
    initialX: 120.25,
    deltaX: 10.25,
  });

  assert.equal(resized.x + resized.width, 420.75);
  assert.equal(resized.width, 290.25);
});

test('haveHorizontalNodeResizeBoundsChanged only reports real x or width changes', () => {
  assert.equal(
    haveHorizontalNodeResizeBoundsChanged(
      { x: 120, width: 300 },
      { x: 120, width: 300 },
    ),
    false,
  );

  assert.equal(
    haveHorizontalNodeResizeBoundsChanged(
      { x: 120, width: 300 },
      { x: 120, width: 301 },
    ),
    true,
  );
});

test('computeBoxNodeResizeBounds resizes comments from the bottom-right corner', () => {
  const resized = computeBoxNodeResizeBounds({
    direction: 'bottom-right',
    initialHeight: 200,
    initialWidth: 300,
    initialX: 120,
    initialY: 80,
    deltaX: 40,
    deltaY: 25,
  });

  assert.deepEqual(resized, {
    x: 120,
    y: 80,
    width: 340,
    height: 225,
  });
});

test('computeBoxNodeResizeBounds preserves the opposite corner when resizing from top-left', () => {
  const resized = computeBoxNodeResizeBounds({
    direction: 'top-left',
    initialHeight: 200,
    initialWidth: 300,
    initialX: 120,
    initialY: 80,
    deltaX: 40,
    deltaY: 25,
  });

  assert.deepEqual(resized, {
    x: 160,
    y: 105,
    width: 260,
    height: 175,
  });
});
