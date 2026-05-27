import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const settingsDir = dirname(fileURLToPath(import.meta.url));

test('settings section field spacing is bottom-owned', () => {
  const source = readFileSync(join(settingsDir, 'settingsPageStyles.ts'), 'utf8');

  assert.match(source, /\.settings-section-fields \{[\s\S]*gap: 0;/);
  assert.match(source, /\.settings-section-fields > \* \{[\s\S]*margin-top: 0 !important;[\s\S]*margin-bottom: var\(--settings-field-gap\);/);
  assert.match(source, /\.settings-section-fields > :last-child \{[\s\S]*margin-bottom: 0;/);
});
