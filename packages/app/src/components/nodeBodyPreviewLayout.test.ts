import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('node body previews distinguish wrapped text from clipped object source', () => {
  const nodeBodySource = readFileSync(join(componentsDir, 'NodeBody.tsx'), 'utf8');
  const objectNodeSource = readFileSync(join(componentsDir, 'nodes', 'ObjectNode.tsx'), 'utf8');
  const colorizedWrapBlock = /\.node-body-colorized-wrap \{(?<styles>[\s\S]*?)\n  \}/.exec(nodeBodySource)?.groups
    ?.styles;

  assert.match(nodeBodySource, /function shouldWrapColorizedNodeBody\(language: string\)/);
  assert.match(nodeBodySource, /language === 'prompt-interpolation-markdown'/);
  assert.ok(colorizedWrapBlock, 'Expected a dedicated CSS block for wrapped colorized node bodies');
  assert.match(colorizedWrapBlock, /max-width: 100%;/);
  assert.match(colorizedWrapBlock, /min-width: 0;/);
  assert.match(colorizedWrapBlock, /overflow-wrap: normal;/);
  assert.match(colorizedWrapBlock, /white-space: pre-wrap;/);
  assert.match(colorizedWrapBlock, /width: 100%;/);
  assert.match(colorizedWrapBlock, /word-break: normal;/);
  assert.doesNotMatch(colorizedWrapBlock, /overflow-wrap:\s*anywhere;/);
  assert.doesNotMatch(colorizedWrapBlock, /word-break:\s*break-word;/);
  assert.match(nodeBodySource, /wrapWords=\{wrapWords\}/);
  assert.match(objectNodeSource, /text-overflow: clip;/);
  assert.doesNotMatch(objectNodeSource, /text-overflow: ellipsis;/);
});

test('wrapped colorized node bodies normalize Monaco non-breaking spaces', () => {
  const colorizedSource = readFileSync(join(componentsDir, 'ColorizedPreformattedText.tsx'), 'utf8');

  assert.match(colorizedSource, /function normalizeColorizedWordWrapSpaces\(element: HTMLElement\)/);
  assert.match(colorizedSource, /replace\(\/\\u00A0\/g, ' '\)/);
  assert.match(colorizedSource, /let cancelled = false;/);
  assert.match(colorizedSource, /if \(wrapWords && !cancelled\) \{/);
  assert.match(colorizedSource, /normalizeColorizedWordWrapSpaces\(body\)/);
  assert.match(colorizedSource, /\.catch\(\(\) => \{\}\)/);
});
