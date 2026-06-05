import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const scalableToggleSource = readFileSync(new URL('./ScalableToggle.tsx', import.meta.url), 'utf8');

test('scalable toggle state marks use centered inline svg icons', () => {
  assert.match(scalableToggleSource, /className="scalable-toggle-mark scalable-toggle-check-mark"/);
  assert.match(scalableToggleSource, /className="scalable-toggle-mark scalable-toggle-cross-mark"/);
  assert.match(scalableToggleSource, /viewBox="0 0 12 12"/);
  assert.match(scalableToggleSource, /stroke="currentColor"/);
  assert.match(scalableToggleSource, /aria-label=\{ariaLabel\}/);
  assert.match(scalableToggleSource, /strokeLinecap="round"/);
  assert.match(scalableToggleSource, /border-radius: 999px;/);
  assert.match(
    scalableToggleSource,
    /\.scalable-toggle-mark\s*{[\s\S]*?position: absolute;[\s\S]*?top: 50%;[\s\S]*?left: 50%;[\s\S]*?width: var\(--toggle-icon-size\);[\s\S]*?height: var\(--toggle-icon-size\);[\s\S]*?transform: translate\(-50%, -50%\);/,
  );
  assert.doesNotMatch(scalableToggleSource, /content: '\\2714';/);
  assert.doesNotMatch(scalableToggleSource, /content: '\\00d7';/);
  assert.doesNotMatch(scalableToggleSource, /\.scalable-toggle-icon-cross::before/);
});

test('checked scalable toggles use the calculated primary foreground for thumb and checkmark contrast', () => {
  assert.match(scalableToggleSource, /--toggle-checked-icon-color: var\(--foreground-on-primary\);/);
  assert.match(
    scalableToggleSource,
    /&:not\(\.is-disabled\):hover\.is-checked \.scalable-toggle-track \{[\s\S]*--toggle-checked-icon-color: var\(--foreground-on-primary-light\);/,
  );
  assert.match(
    scalableToggleSource,
    /&\.is-checked \.scalable-toggle-thumb \{[\s\S]*background-color: var\(--toggle-checked-icon-color\);/,
  );
  assert.match(
    scalableToggleSource,
    /&\.is-checked \.scalable-toggle-icon-check \{[\s\S]*color: var\(--toggle-checked-icon-color\);/,
  );
});
