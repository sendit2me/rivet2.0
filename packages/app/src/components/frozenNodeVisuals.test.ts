import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const appSrcDir = dirname(componentsDir);

test('frozen node canvas visuals stay compact and blue-accented', () => {
  const normalVisualNodeContentSource = readFileSync(
    join(componentsDir, 'visualNode', 'NormalVisualNodeContent.tsx'),
    'utf8',
  );
  const zoomedOutVisualNodeContentSource = readFileSync(
    join(componentsDir, 'visualNode', 'ZoomedOutVisualNodeContent.tsx'),
    'utf8',
  );
  const nodeStylesSource = readFileSync(join(componentsDir, 'nodeStyles.ts'), 'utf8');
  const snowflakeIconSource = readFileSync(join(appSrcDir, 'assets', 'icons', 'snowflake-icon.svg'), 'utf8');

  assert.equal([...snowflakeIconSource.matchAll(/<path\b/g)].length, 3);
  assert.match(normalVisualNodeContentSource, /<Tooltip content="Frozen node" tag="span" className="frozen-node-tooltip">/);
  assert.match(
    zoomedOutVisualNodeContentSource,
    /<Tooltip content="Frozen node" tag="span" className="frozen-node-tooltip">/,
  );
  assert.match(
    nodeStylesSource,
    /\.node\.frozen:not\(\.isComment\) \.title-controls \{[\s\S]*gap: calc\(3px \* var\(--ui-font-scale\)\);[\s\S]*width: calc\(72px \* var\(--ui-font-scale\)\);/,
  );
  assert.match(nodeStylesSource, /--node-frozen-output-accent: #68b7ff;/);
  assert.match(
    nodeStylesSource,
    /\.node\.frozen\.success:not\(\.running\) \.node-output:not\(\.multi\) \.node-output-inner,/,
  );
  assert.match(nodeStylesSource, /\.node\.frozen\.success:not\(\.running\) \.node-output:before \{/);
});
