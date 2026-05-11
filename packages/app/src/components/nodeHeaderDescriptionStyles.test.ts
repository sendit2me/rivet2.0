import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('node header description uses a stable light weight in embedded hosts', () => {
  const nodeStylesSource = readFileSync(join(componentsDir, 'nodeStyles.ts'), 'utf8');
  const descriptionBlock = /\.node \.node-title \.title-text-description \{(?<styles>[\s\S]*?)\n  \}/.exec(
    nodeStylesSource,
  )?.groups?.styles;

  assert.ok(descriptionBlock, 'Expected node header description styles to be scoped to the node title');
  assert.match(descriptionBlock, /font-size: var\(--ui-font-size-xs\);/);
  assert.match(descriptionBlock, /font-weight: 300;/);
  assert.match(descriptionBlock, /letter-spacing: 0;/);
  assert.doesNotMatch(descriptionBlock, /font-weight:\s*100/);
});
