import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const navigationBarSource = readFileSync(new URL('./NavigationBar.tsx', import.meta.url), 'utf8');

test('graph history navigation renders unavailable directions as disabled buttons', () => {
  assert.match(navigationBarSource, /<GraphHistoryButton[\s\S]*?disabled=\{!navigationStack\.hasBackward\}/);
  assert.match(navigationBarSource, /<GraphHistoryButton[\s\S]*?disabled=\{!navigationStack\.hasForward\}/);
  assert.match(navigationBarSource, /<button[\s\S]*?aria-label=\{label\}[\s\S]*?disabled=\{disabled\}/);
  assert.match(navigationBarSource, /onClick=\{disabled \? undefined : onClick\}/);
  assert.doesNotMatch(navigationBarSource, /graph-history-button-placeholder/);
});
