import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));
const appSrcDir = dirname(componentsDir);

test('frozen node output visuals stay compact and canvas-scoped', () => {
  const normalVisualNodeContentSource = readFileSync(
    join(componentsDir, 'visualNode', 'NormalVisualNodeContent.tsx'),
    'utf8',
  );
  const zoomedOutVisualNodeContentSource = readFileSync(
    join(componentsDir, 'visualNode', 'ZoomedOutVisualNodeContent.tsx'),
    'utf8',
  );
  const nodeFullscreenOutputSource = readFileSync(
    join(componentsDir, 'nodeOutput', 'NodeFullscreenOutput.tsx'),
    'utf8',
  );
  const nodeStylesSource = readFileSync(join(componentsDir, 'nodeStyles.ts'), 'utf8');
  const contextMenuConfigurationSource = readFileSync(join(appSrcDir, 'hooks', 'useContextMenuConfiguration.ts'), 'utf8');
  const snowflakeIconSource = readFileSync(join(appSrcDir, 'assets', 'icons', 'snowflake-icon.svg'), 'utf8');

  assert.equal([...snowflakeIconSource.matchAll(/<path\b/g)].length, 3);
  assert.match(contextMenuConfigurationSource, /label: 'Freeze node output'/);
  assert.match(contextMenuConfigurationSource, /label: 'Freeze node outputs'/);
  assert.match(contextMenuConfigurationSource, /label: 'Unfreeze node output'/);
  assert.match(contextMenuConfigurationSource, /label: 'Unfreeze node outputs'/);
  assert.match(
    normalVisualNodeContentSource,
    /<Tooltip content="Frozen output" tag="span" className="frozen-node-tooltip">/,
  );
  assert.match(
    zoomedOutVisualNodeContentSource,
    /<Tooltip content="Frozen output" tag="span" className="frozen-node-tooltip">/,
  );
  assert.match(
    nodeStylesSource,
    /\.node\.frozen:not\(\.isComment\) \.title-controls \{[\s\S]*gap: calc\(3px \* var\(--ui-font-scale\)\);[\s\S]*width: calc\(72px \* var\(--ui-font-scale\)\);/,
  );
  assert.match(nodeStylesSource, /--node-frozen-output-accent: #68b7ff;/);
  assert.match(nodeStylesSource, /--node-frozen-output-pattern: url\("data:image\/svg\+xml,/);
  assert.match(nodeStylesSource, /width='113' height='71'/);
  assert.match(nodeStylesSource, /stroke-opacity='\.09'/);
  assert.match(nodeStylesSource, /stroke-width='1\.7'/);
  assert.match(nodeStylesSource, /stroke-width='\.75'/);
  assert.match(nodeStylesSource, /background-position: -11px -7px;/);
  assert.match(nodeStylesSource, /background-size: 113px 71px;/);
  assert.doesNotMatch(nodeStylesSource, /\.node\.frozen:not\(\.isComment\) \.node-title \{/);
  assert.doesNotMatch(nodeStylesSource, /node-frozen-header-foreground/);
  assert.doesNotMatch(
    nodeStylesSource,
    /\.node\.frozen\.hasCustomBorderColor:not\(\.isComment\):not\(\.selected\):not\(\.hovered\):not\(\.overlayNode\)/,
  );
  assert.match(
    nodeStylesSource,
    /\.node\.frozen\.success:not\(\.running\) \.node-output:not\(\.multi\) \.node-output-inner,/,
  );
  assert.match(nodeStylesSource, /background-image: var\(--node-frozen-output-pattern\);/);
  assert.match(nodeStylesSource, /\.node\.frozen\.success:not\(\.running\) \.node-output:before \{/);
  assert.doesNotMatch(nodeFullscreenOutputSource, /frozenNodeOutputsState/);
  assert.doesNotMatch(nodeFullscreenOutputSource, /\[data-testid='fullscreen-output-modal--scrollable'\] \{/);
  assert.doesNotMatch(nodeFullscreenOutputSource, /fullscreen-output-body[\s\S]*hasFrozenOutput \? ' frozen-output'/);
  assert.doesNotMatch(nodeFullscreenOutputSource, /contentClassName=/);
  assert.doesNotMatch(nodeFullscreenOutputSource, /frozenFullscreenOutputModalCss/);
});
