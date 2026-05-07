import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('SettingsModal uses independent viewport-capped column scrolling', () => {
  const source = readFileSync(join(componentsDir, 'SettingsModal.tsx'), 'utf8');

  assert.match(source, /const SETTINGS_MODAL_HEIGHT = 'calc\(100vh - 48px\)'/);
  assert.match(source, /height=\{SETTINGS_MODAL_HEIGHT\}/);
  assert.doesNotMatch(source, /height="80%"/);
  assert.match(source, /nav \{[\s\S]*max-height: 100%;[\s\S]*overflow: auto;/);
  assert.match(source, /main \{[\s\S]*height: 100%;[\s\S]*overflow: auto;/);
  assert.match(source, /overflow: hidden;/);
});
