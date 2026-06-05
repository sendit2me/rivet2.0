import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = dirname(fileURLToPath(import.meta.url));

test('canvas action bar has no shared button group surface', () => {
  const actionBarSource = readFileSync(join(srcDir, 'ActionBar.tsx'), 'utf8');

  const rootStyles = actionBarSource.match(/const styles = css`(?<styles>[\s\S]*?)\n  \.run-button button,/)?.groups
    ?.styles;
  const moreMenuStyles = actionBarSource.match(/\.more-menu \{(?<styles>[\s\S]*?)\n  \}/)?.groups?.styles;

  assert.ok(rootStyles);
  assert.match(rootStyles, /background: transparent;/);
  assert.match(rootStyles, /border: 0;/);
  assert.match(rootStyles, /box-shadow: none;/);
  assert.doesNotMatch(rootStyles, /background: var\(--grey-darker\);/);
  assert.ok(moreMenuStyles);
  assert.match(moreMenuStyles, /background-color: var\(--grey-darker\);/);
  assert.match(moreMenuStyles, /border: 1px solid var\(--grey-dark\);/);
  assert.match(moreMenuStyles, /box-shadow: 2px 1px 8px var\(--shadow\);/);
  assert.match(moreMenuStyles, /color: var\(--foreground\);/);
  assert.match(moreMenuStyles, /svg \{[\s\S]*color: currentColor;/);
});
