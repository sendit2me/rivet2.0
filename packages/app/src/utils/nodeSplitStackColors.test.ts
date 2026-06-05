import assert from 'node:assert/strict';
import test from 'node:test';
import { getSplitStackGhostColors } from './nodeSplitStackColors.js';

test('dark neutral node colors use the strongest lift profile', () => {
  assert.deepEqual(getSplitStackGhostColors('var(--node-color-8)'), {
    frontBackground: 'color-mix(in srgb, var(--node-color-8) 68%, white 32%)',
    backBackground: 'color-mix(in srgb, var(--node-color-8) 58%, white 42%)',
  });
});

test('default gray node backgrounds use the strongest lift profile', () => {
  assert.deepEqual(getSplitStackGhostColors('var(--node-color-0)'), {
    frontBackground: 'color-mix(in srgb, var(--node-color-0) 68%, white 32%)',
    backBackground: 'color-mix(in srgb, var(--node-color-0) 58%, white 42%)',
  });
});

test('bright yellow node colors use the gentle lift profile', () => {
  assert.deepEqual(getSplitStackGhostColors('var(--node-color-6)'), {
    frontBackground: 'color-mix(in srgb, var(--node-color-6) 92%, white 8%)',
    backBackground: 'color-mix(in srgb, var(--node-color-6) 86%, white 14%)',
  });
});

test('mid purple node colors use the middle lift profile', () => {
  assert.deepEqual(getSplitStackGhostColors('var(--node-color-2)'), {
    frontBackground: 'color-mix(in srgb, var(--node-color-2) 82%, white 18%)',
    backBackground: 'color-mix(in srgb, var(--node-color-2) 72%, white 28%)',
  });
});

test('unknown or custom node colors fall back safely to the middle lift profile', () => {
  assert.deepEqual(getSplitStackGhostColors('#445566'), {
    frontBackground: 'color-mix(in srgb, #445566 82%, white 18%)',
    backBackground: 'color-mix(in srgb, #445566 72%, white 28%)',
  });
});
