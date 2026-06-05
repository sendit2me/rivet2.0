import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = dirname(fileURLToPath(import.meta.url));

test('shared popup menu surfaces use the opaque theme-tinted material', () => {
  const popupMenuSource = readFileSync(join(srcDir, 'PopupMenu.tsx'), 'utf8');

  assert.match(
    popupMenuSource,
    /export const popupMenuSurfaceStyles = css`[\s\S]*background-color: var\(--grey-dark-colorish\);/,
  );
  assert.doesNotMatch(popupMenuSource, /background-color: var\(--grey-dark-colorish-seethrough\);/);
  assert.doesNotMatch(popupMenuSource, /background-color: var\(--foreground-on-primary\);/);
});
