import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  LEFT_SIDEBAR_DRAG_COLLAPSE_WIDTH,
  LEFT_SIDEBAR_ATTACHED_CONTROL_GAP,
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_CANVAS_WIDTH_WITH_LEFT_SIDEBAR,
  MIN_LEFT_SIDEBAR_WIDTH,
  clampLeftSidebarWidth,
  getLeftSidebarAttachedControlOffset,
  shouldCollapseLeftSidebarDrag,
} from './leftSidebarWidth.js';

test('clampLeftSidebarWidth uses the default for invalid values', () => {
  assert.equal(clampLeftSidebarWidth(Number.NaN, 1200), DEFAULT_LEFT_SIDEBAR_WIDTH);
  assert.equal(clampLeftSidebarWidth(Number.POSITIVE_INFINITY, 1200), DEFAULT_LEFT_SIDEBAR_WIDTH);
});

test('clampLeftSidebarWidth clamps invalid values against the viewport', () => {
  const viewportWidth = 600;

  assert.equal(clampLeftSidebarWidth(Number.NaN, viewportWidth), viewportWidth - MIN_CANVAS_WIDTH_WITH_LEFT_SIDEBAR);
});

test('clampLeftSidebarWidth applies fixed min and max bounds', () => {
  assert.equal(clampLeftSidebarWidth(MIN_LEFT_SIDEBAR_WIDTH - 10, 1200), MIN_LEFT_SIDEBAR_WIDTH);
  assert.equal(clampLeftSidebarWidth(MAX_LEFT_SIDEBAR_WIDTH + 10, 1200), MAX_LEFT_SIDEBAR_WIDTH);
});

test('clampLeftSidebarWidth can run outside the browser', () => {
  assert.equal(clampLeftSidebarWidth(300), 300);
});

test('clampLeftSidebarWidth leaves enough canvas width visible', () => {
  const viewportWidth = 700;

  assert.equal(clampLeftSidebarWidth(500, viewportWidth), viewportWidth - MIN_CANVAS_WIDTH_WITH_LEFT_SIDEBAR);
});

test('left-sidebar attached controls keep the expected canvas-side gap', () => {
  assert.equal(LEFT_SIDEBAR_ATTACHED_CONTROL_GAP, 25);
  assert.equal(getLeftSidebarAttachedControlOffset(300), 325);
});

test('left-sidebar drag collapses only past half of the minimum width', () => {
  assert.equal(LEFT_SIDEBAR_DRAG_COLLAPSE_WIDTH, MIN_LEFT_SIDEBAR_WIDTH / 2);
  assert.equal(shouldCollapseLeftSidebarDrag(LEFT_SIDEBAR_DRAG_COLLAPSE_WIDTH), true);
  assert.equal(shouldCollapseLeftSidebarDrag(LEFT_SIDEBAR_DRAG_COLLAPSE_WIDTH + 1), false);
  assert.equal(shouldCollapseLeftSidebarDrag(Number.NaN), false);
});
