import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('comment node markdown headings keep readable line height when wrapped', () => {
  const commentNodeSource = readFileSync(join(componentsDir, 'nodes', 'CommentNode.tsx'), 'utf8');
  const headingBlock = /h1,[\s\S]*?h6 \{(?<styles>[\s\S]*?)\n  \}/.exec(commentNodeSource)?.groups?.styles;

  assert.ok(headingBlock, 'Expected Comment node heading styles to be present');
  assert.match(headingBlock, /line-height: 1\.12;/);
  assert.match(headingBlock, /overflow-wrap: anywhere;/);
});

test('comment node header controls keep an inset compact hit area', () => {
  const nodeStylesSource = readFileSync(join(componentsDir, 'nodeStyles.ts'), 'utf8');
  const titleBlock = /\.node\.node\.isComment \.node-title \{(?<styles>[\s\S]*?)\n  \}/.exec(nodeStylesSource)
    ?.groups?.styles;
  const controlsBlock = /\.node\.isComment \.title-controls \{(?<styles>[\s\S]*?)\n  \}/.exec(nodeStylesSource)
    ?.groups?.styles;
  const overlayPointerBlock =
    /\.node\.isComment\.overlayNode \.node-title,[\s\S]*?\.node\.isComment\.overlayNode \.node-body \* \{(?<styles>[\s\S]*?)\n  \}/.exec(
      nodeStylesSource,
    )?.groups?.styles;

  assert.ok(titleBlock, 'Expected Comment node title styles to be present');
  assert.match(titleBlock, /padding: calc\(4px \* var\(--ui-font-scale\)\) calc\(8px \* var\(--ui-font-scale\)\);/);

  assert.ok(controlsBlock, 'Expected Comment node title control styles to be present');
  assert.match(controlsBlock, /flex: 0 0 calc\(66px \* var\(--ui-font-scale\)\);/);
  assert.match(controlsBlock, /margin-right: 0;/);
  assert.match(controlsBlock, /margin-top: 0;/);
  assert.match(controlsBlock, /min-height: calc\(30px \* var\(--ui-font-scale\)\);/);
  assert.match(controlsBlock, /width: calc\(66px \* var\(--ui-font-scale\)\);/);
  assert.match(controlsBlock, /height: calc\(30px \* var\(--ui-font-scale\)\);/);
  assert.match(controlsBlock, /margin: 0;/);

  assert.ok(overlayPointerBlock, 'Expected Comment drag previews to disable body pointer hover');
  assert.match(overlayPointerBlock, /pointer-events: none;/);
});
