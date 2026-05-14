import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('wire layer stays clipped to the canvas box for embedded iframe hosts', () => {
  const source = readFileSync(join(componentsDir, 'WireLayer.tsx'), 'utf8');
  const wireStyles = /const wiresStyles = css`(?<styles>[\s\S]*?)`;/u.exec(source)?.groups?.styles;

  assert.ok(wireStyles, 'Expected WireLayer styles to stay local to wiresStyles');
  assert.match(wireStyles, /position: absolute;/);
  assert.match(wireStyles, /inset: 0;/);
  assert.doesNotMatch(wireStyles, /overflow:\s*visible;/);
});
