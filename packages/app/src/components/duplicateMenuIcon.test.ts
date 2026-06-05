import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const appSrcDir = resolve(componentsDir, '..');

test('duplicate menu actions use the simple two-rectangle icon', () => {
  const graphListSource = readFileSync(join(componentsDir, 'GraphList.tsx'), 'utf8');
  const contextMenuSource = readFileSync(join(appSrcDir, 'hooks', 'useContextMenuConfiguration.ts'), 'utf8');
  const duplicateIconSource = readFileSync(join(appSrcDir, 'assets', 'icons', 'duplicate-icon.svg'), 'utf8');

  assert.match(graphListSource, /duplicate-icon\.svg\?react/);
  assert.match(contextMenuSource, /duplicate-icon\.svg\?react/);
  assert.doesNotMatch(graphListSource, /image-multiple-line/);
  assert.doesNotMatch(contextMenuSource, /image-multiple-line/);
  assert.equal([...duplicateIconSource.matchAll(/<rect\b/g)].length, 2);
  assert.match(duplicateIconSource, /width="13"/);
  assert.match(duplicateIconSource, /rx="1\.25"/);
  assert.doesNotMatch(duplicateIconSource, /<rect\b[^>]*fill=/);
  assert.doesNotMatch(duplicateIconSource, /foreground-on-primary/);
  assert.doesNotMatch(duplicateIconSource, /<path\b/);
});
