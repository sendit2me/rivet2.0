import assert from 'node:assert/strict';
import test from 'node:test';
import { getWheelZoomFactor } from './useNodeCanvasInteractions.js';

function assertAlmostEqual(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-12, `expected ${actual} to equal ${expected}`);
}

test('getWheelZoomFactor uses the configured wheel zoom sensitivity for normal zooming', () => {
  assert.equal(
    getWheelZoomFactor({
      wheelDelta: -120,
      zoomSensitivity: 0.25,
      shiftKey: false,
    }),
    1.025,
  );
  assert.equal(
    getWheelZoomFactor({
      wheelDelta: 120,
      zoomSensitivity: 0.25,
      shiftKey: false,
    }),
    0.975,
  );
});

test('getWheelZoomFactor applies the faster shift-wheel zoom multiplier', () => {
  assert.equal(
    getWheelZoomFactor({
      wheelDelta: -120,
      zoomSensitivity: 0.25,
      shiftKey: true,
    }),
    1.15,
  );
  assert.equal(
    getWheelZoomFactor({
      wheelDelta: 120,
      zoomSensitivity: 0.25,
      shiftKey: true,
    }),
    0.85,
  );
});

test('getWheelZoomFactor clamps extreme shift-wheel zoom speed so zoom-out stays positive', () => {
  assert.equal(
    getWheelZoomFactor({
      wheelDelta: -120,
      zoomSensitivity: 2,
      shiftKey: true,
    }),
    1.95,
  );
  assertAlmostEqual(
    getWheelZoomFactor({
      wheelDelta: 120,
      zoomSensitivity: 2,
      shiftKey: true,
    }),
    0.05,
  );
});
