import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_NODE_HEADER_COLOR,
  HEADER_ONLY_NODE_BORDER_COLOR,
  PROJECT_DEFAULT_NODE_HEADER_COLOR,
  createBorderAndHeaderNodeColor,
  createHeaderOnlyNodeColor,
  getNodeBorderReferenceColor,
  getNodeHeaderColor,
  getNodeHeaderForegroundColor,
  isNodeBorderVisible,
} from './nodeColor';

test('header-only node colors keep the header color without a visible resting border', () => {
  const color = createHeaderOnlyNodeColor('var(--node-color-1)');

  assert.deepEqual(color, {
    bg: 'var(--node-color-1)',
    border: HEADER_ONLY_NODE_BORDER_COLOR,
  });
  assert.equal(isNodeBorderVisible(color), false);
  assert.equal(getNodeHeaderColor(color), 'var(--node-color-1)');
  assert.equal(getNodeBorderReferenceColor(color), 'var(--node-color-1)');
});

test('border-and-header node colors expose the same color for the visible resting border', () => {
  const color = createBorderAndHeaderNodeColor('var(--node-color-2)');

  assert.deepEqual(color, {
    bg: 'var(--node-color-2)',
    border: 'var(--node-color-2)',
  });
  assert.equal(isNodeBorderVisible(color), true);
  assert.equal(getNodeHeaderColor(color), 'var(--node-color-2)');
  assert.equal(getNodeBorderReferenceColor(color), 'var(--node-color-2)');
});

test('missing node color resolves to the neutral default header skin', () => {
  assert.equal(PROJECT_DEFAULT_NODE_HEADER_COLOR, 'var(--grey-darkish)');
  assert.equal(isNodeBorderVisible(undefined), false);
  assert.equal(getNodeHeaderColor(undefined), DEFAULT_NODE_HEADER_COLOR);
  assert.equal(getNodeBorderReferenceColor(undefined), DEFAULT_NODE_HEADER_COLOR);
});

test('legacy border-only node colors render as header-only colors', () => {
  const color = {
    bg: 'var(--grey-darkish)',
    border: 'var(--node-color-4)',
  };

  assert.equal(isNodeBorderVisible(color), false);
  assert.equal(getNodeHeaderColor(color), 'var(--node-color-4)');
  assert.equal(getNodeBorderReferenceColor(color), 'var(--node-color-4)');
});

test('legacy explicit default header values normalize to the current neutral node color token', () => {
  const color = createHeaderOnlyNodeColor('var(--grey-darkish)');

  assert.equal(isNodeBorderVisible(color), false);
  assert.equal(getNodeHeaderColor(color), DEFAULT_NODE_HEADER_COLOR);
  assert.equal(getNodeBorderReferenceColor(color), DEFAULT_NODE_HEADER_COLOR);
});

test('explicit default border-and-header color keeps its visible border', () => {
  const color = createBorderAndHeaderNodeColor(DEFAULT_NODE_HEADER_COLOR);

  assert.equal(isNodeBorderVisible(color), true);
  assert.equal(getNodeHeaderColor(color), DEFAULT_NODE_HEADER_COLOR);
  assert.equal(getNodeBorderReferenceColor(color), DEFAULT_NODE_HEADER_COLOR);
});

test('explicit neutral header-only color keeps the neutral header', () => {
  const color = createHeaderOnlyNodeColor(DEFAULT_NODE_HEADER_COLOR);

  assert.equal(isNodeBorderVisible(color), false);
  assert.equal(getNodeHeaderColor(color), DEFAULT_NODE_HEADER_COLOR);
  assert.equal(getNodeBorderReferenceColor(color), DEFAULT_NODE_HEADER_COLOR);
});

test('node header foregrounds use black or white contrast for literal header colors', () => {
  assert.equal(getNodeHeaderForegroundColor('var(--node-color-1)'), '#000');
  assert.equal(getNodeHeaderForegroundColor('var(--node-color-2)'), '#000');
  assert.equal(getNodeHeaderForegroundColor('var(--node-color-8)'), '#fff');
  assert.equal(getNodeHeaderForegroundColor('#ffffff'), '#000');
  assert.equal(getNodeHeaderForegroundColor('#000000'), '#fff');
});

test('node header foregrounds keep the neutral node foreground token for theme-dependent default headers', () => {
  assert.equal(getNodeHeaderForegroundColor(DEFAULT_NODE_HEADER_COLOR), 'var(--node-color-0-foreground)');
  assert.equal(getNodeHeaderForegroundColor(PROJECT_DEFAULT_NODE_HEADER_COLOR), 'var(--node-color-0-foreground)');
});
