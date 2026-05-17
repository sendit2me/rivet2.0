import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const scalableToggleSource = readFileSync(new URL('./ScalableToggle.tsx', import.meta.url), 'utf8');

test('scalable toggle state marks use centered inline svg icons', () => {
  assert.match(scalableToggleSource, /className="scalable-toggle-mark scalable-toggle-check-mark"/);
  assert.match(scalableToggleSource, /className="scalable-toggle-mark scalable-toggle-cross-mark"/);
  assert.match(scalableToggleSource, /viewBox="0 0 12 12"/);
  assert.match(scalableToggleSource, /stroke="currentColor"/);
  assert.match(scalableToggleSource, /strokeLinecap="round"/);
  assert.match(
    scalableToggleSource,
    /\.scalable-toggle-mark\s*{[\s\S]*?position: absolute;[\s\S]*?top: 50%;[\s\S]*?left: 50%;[\s\S]*?width: var\(--toggle-icon-size\);[\s\S]*?height: var\(--toggle-icon-size\);[\s\S]*?transform: translate\(-50%, -50%\);/,
  );
  assert.doesNotMatch(scalableToggleSource, /content: '\\2714';/);
  assert.doesNotMatch(scalableToggleSource, /content: '\\00d7';/);
  assert.doesNotMatch(scalableToggleSource, /\.scalable-toggle-icon-cross::before/);
});
