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

test('node editor keeps selected-node editor identity stable across panel rerenders', () => {
  const nodeEditorSource = readFileSync(join(componentsDir, 'NodeEditor.tsx'), 'utf8');

  assert.match(nodeEditorSource, /const nodeForEditor = useMemo\(/);
  assert.match(nodeEditorSource, /: selectedNode,\s+\[isVariant, selectedNode, selectedVariantData\]/);
});

test('node code editor lazy loading keeps the field shell visible', () => {
  const codeEditorSource = readFileSync(join(componentsDir, 'editors', 'CodeEditor.tsx'), 'utf8');
  const defaultNodeEditorSource = readFileSync(join(componentsDir, 'editors', 'DefaultNodeEditor.tsx'), 'utf8');

  assert.match(defaultNodeEditorSource, /const editorLoadKey = `\$\{node\.id\}:\$\{node\.type\}`;/);
  assert.match(defaultNodeEditorSource, /editorState\?\.editorLoadKey === editorLoadKey \? editorState\.editors : \[\]/);
  assert.match(codeEditorSource, /const CodeEditorLoadingFallback: FC = \(\) =>/);
  assert.match(codeEditorSource, /<Suspense fallback=\{<CodeEditorLoadingFallback \/>\}>/);
  assert.doesNotMatch(codeEditorSource, /<Suspense fallback=\{<div \/>\}>\s+<div className="editor-wrapper-wrapper">/);
  assert.match(defaultNodeEditorSource, /\.code-editor-loading-placeholder/);
});

test('node code editor text stats are editor-definition driven', () => {
  const codeEditorSource = readFileSync(join(componentsDir, 'editors', 'CodeEditor.tsx'), 'utf8');

  assert.match(codeEditorSource, /showTextStats: 'showTextStats' in editorDef && editorDef\.showTextStats === true,/);
  assert.doesNotMatch(codeEditorSource, /node\.type === 'text' && editorDef\.dataKey === 'text'/);
});

test('node code editor lets panel scrolling continue at editor scroll edges', () => {
  const codeEditorSource = readFileSync(join(componentsDir, 'CodeEditor.tsx'), 'utf8');

  assert.match(
    codeEditorSource,
    /scrollbar: \{\s+alwaysConsumeMouseWheel: false,\s+\},/,
  );
});
