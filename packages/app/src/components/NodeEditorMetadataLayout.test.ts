import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('node metadata title and description share the same text inset', () => {
  const nodeEditorSource = readFileSync(join(componentsDir, 'NodeEditor.tsx'), 'utf8');

  assert.match(nodeEditorSource, /--node-metadata-text-inset: 12px;/);
  assert.match(nodeEditorSource, /--node-metadata-control-border-width: 1px;/);
  assert.match(
    nodeEditorSource,
    /\.node-title-field \.node-title-read-button \.title-read-content {\s+width: 100%;[\s\S]*?padding: 0 var\(--node-metadata-text-inset\);/,
  );
  assert.match(
    nodeEditorSource,
    /\.node-title-field input {\s+height: 40px;[\s\S]*?padding: 0 calc\(var\(--node-metadata-text-inset\) - var\(--node-metadata-control-border-width\)\);/,
  );
  assert.match(
    nodeEditorSource,
    /\.node-description-field \[data-read-view-fit-container-width='true'\] {\s+display: block;[\s\S]*?border: 0 !important;/,
  );
  assert.match(
    nodeEditorSource,
    /\.node-description-field \.description-read-content {\s+width: 100%;[\s\S]*?padding: 10px var\(--node-metadata-text-inset\);/,
  );
  assert.match(
    nodeEditorSource,
    /\.node-description-field textarea {\s+min-height: 14px;[\s\S]*?padding: 10px calc\(var\(--node-metadata-text-inset\) - var\(--node-metadata-control-border-width\)\);/,
  );
});
