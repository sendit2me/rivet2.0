import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = dirname(fileURLToPath(import.meta.url));

test('host.css owns the shared reset used by standalone and embedded app mounts', () => {
  const hostCss = readFileSync(join(srcDir, 'host.css'), 'utf8');
  const appTsx = readFileSync(join(srcDir, 'App.tsx'), 'utf8');

  const colorsImportIndex = hostCss.indexOf("@import './colors.css';");
  const resetImportIndex = hostCss.indexOf("@import '@atlaskit/css-reset';");

  assert.ok(colorsImportIndex >= 0, 'host.css should import app colors before the shared reset');
  assert.ok(resetImportIndex > colorsImportIndex, 'host.css should import the shared reset after app styles');
  assert.doesNotMatch(appTsx, /@atlaskit\/css-reset/);
});
