import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = dirname(fileURLToPath(import.meta.url));

test('UI settings group canvas color and pattern controls under Canvas', () => {
  const uiSettingsPageSource = readFileSync(join(srcDir, 'UiSettingsPage.tsx'), 'utf8');

  assert.match(uiSettingsPageSource, /label="Theme"/);
  assert.match(uiSettingsPageSource, /options={themes}/);
  assert.match(uiSettingsPageSource, /theme === 'custom'/);
  assert.match(uiSettingsPageSource, /label="Custom primary color"/);
  assert.match(uiSettingsPageSource, /customThemePrimaryColorState/);
  assert.match(uiSettingsPageSource, /formatCustomThemePrimaryColor/);
  assert.match(uiSettingsPageSource, /<h2 id="ui-settings-canvas" className="settings-section-heading">\s+Canvas\s+<\/h2>/);
  assert.doesNotMatch(uiSettingsPageSource, />\s*Canvas pattern\s*<\/h2>/);
  assert.match(uiSettingsPageSource, /label="Canvas color"/);
  assert.match(uiSettingsPageSource, /name="canvas-color"/);
  assert.match(uiSettingsPageSource, /options={canvasBackgroundColorOptions}/);
  assert.match(uiSettingsPageSource, /normalizedCanvasBackgroundColorMode === 'custom'/);
  assert.match(uiSettingsPageSource, /<TripleBarColorPicker/);
  assert.match(uiSettingsPageSource, /label="Pattern type"/);
});
