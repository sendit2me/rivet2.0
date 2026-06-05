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

test('node metadata footer stays content-sized and pinned below settings content', () => {
  const nodeEditorSource = readFileSync(join(componentsDir, 'NodeEditor.tsx'), 'utf8');
  const sectionFooterStyles = nodeEditorSource.match(/\.section-footer \{(?<styles>[\s\S]*?)\n  \}/)
    ?.groups?.styles;

  assert.ok(sectionFooterStyles);
  assert.match(sectionFooterStyles, /display: flex;/);
  assert.match(sectionFooterStyles, /flex-shrink: 0;/);
  assert.match(sectionFooterStyles, /justify-content: flex-end;/);
  assert.match(sectionFooterStyles, /padding: 0\.5em 1em 1em 1em;/);
  assert.doesNotMatch(sectionFooterStyles, /^\s*height:\s*24px;/m);
});

test('node settings panel uses regular UI typography outside embedded code editors', () => {
  const nodeEditorSource = readFileSync(join(componentsDir, 'NodeEditor.tsx'), 'utf8');
  const defaultNodeEditorSource = readFileSync(join(componentsDir, 'editors', 'DefaultNodeEditor.tsx'), 'utf8');
  const panelContainerStyles = nodeEditorSource.match(/^  \.panel-container \{(?<styles>[\s\S]*?)\n  \}/m)
    ?.groups?.styles;
  const sectionFooterStyles = nodeEditorSource.match(/\.section-footer \{(?<styles>[\s\S]*?)\n  \}/)
    ?.groups?.styles;
  const titleReadContentStyles = nodeEditorSource.match(
    /\.node-title-field \.node-title-read-button \.title-read-content \{(?<styles>[\s\S]*?)\n  \}/,
  )?.groups?.styles;
  const metadataInputStyles = nodeEditorSource.match(
    /\.node-title-field input,\s+\.node-description-field textarea \{(?<styles>[\s\S]*?)\n  \}/,
  )?.groups?.styles;
  const editorStatusLineStyles = defaultNodeEditorSource.match(
    /\.editor-status-line \{(?<styles>[\s\S]*?)\n  \}/,
  )?.groups?.styles;

  assert.ok(panelContainerStyles);
  assert.ok(sectionFooterStyles);
  assert.ok(titleReadContentStyles);
  assert.ok(metadataInputStyles);
  assert.ok(editorStatusLineStyles);
  assert.match(panelContainerStyles, /font-family: var\(--font-family\);/);
  assert.match(panelContainerStyles, /--ds-font-family-body: var\(--font-family\);/);
  assert.match(panelContainerStyles, /--ds-font-family-heading: var\(--font-family\);/);
  assert.match(panelContainerStyles, /--ds-font-family-code: var\(--font-family-monospace\);/);
  assert.match(panelContainerStyles, /--label-font-family: var\(--font-family\);/);
  assert.match(panelContainerStyles, /border-left: 1px solid var\(--grey-darkish\);/);
  assert.match(panelContainerStyles, /box-shadow: none;/);
  assert.doesNotMatch(sectionFooterStyles, /font-family: var\(--font-family-monospace\);/);
  assert.doesNotMatch(titleReadContentStyles, /font-family: var\(--font-family-monospace\);/);
  assert.doesNotMatch(metadataInputStyles, /font-family: var\(--font-family-monospace\);/);
  assert.doesNotMatch(editorStatusLineStyles, /font-family: var\(--font-family-monospace\);/);
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

test('node code editor is preloaded before settings need it', () => {
  const lazyComponentsSource = readFileSync(join(componentsDir, 'LazyComponents.tsx'), 'utf8');
  const graphBuilderSource = readFileSync(join(componentsDir, 'GraphBuilder.tsx'), 'utf8');
  const appSource = readFileSync(join(componentsDir, 'RivetApp.tsx'), 'utf8');

  assert.match(lazyComponentsSource, /export function preloadCodeEditor\(\): Promise<CodeEditorModule>/);
  assert.match(lazyComponentsSource, /codeEditorPreloadPromise = undefined;/);
  assert.match(lazyComponentsSource, /export function warmCodeEditor\(\): void/);
  assert.match(lazyComponentsSource, /const LazyCodeEditorImpl = lazy\(preloadCodeEditor\);/);
  assert.match(appSource, /requestIdleCallback\(preload, \{ timeout: 2500 \}\)/);
  assert.match(graphBuilderSource, /warmCodeEditor\(\);\s+setEditingNodeId\(node\.id\);/);
});

test('node color picker is not split into a fragile dev lazy module', () => {
  const lazyComponentsSource = readFileSync(join(componentsDir, 'LazyComponents.tsx'), 'utf8');
  const colorEditorSource = readFileSync(join(componentsDir, 'editors', 'ColorEditor.tsx'), 'utf8');

  assert.doesNotMatch(lazyComponentsSource, /TripleBarColorPicker/);
  assert.match(colorEditorSource, /import \{ TripleBarColorPicker \} from '\.\.\/TripleBarColorPicker';/);
  assert.doesNotMatch(colorEditorSource, /LazyTripleBarColorPicker|Suspense/);
});

test('collapsible settings surfaces share opaque colors across panels and modals', () => {
  const colorsSource = readFileSync(join(componentsDir, '..', 'colors.css'), 'utf8');
  const editorGroupSource = readFileSync(join(componentsDir, 'editors', 'EditorGroup.tsx'), 'utf8');
  const projectInfoModalSource = readFileSync(join(componentsDir, 'ProjectInfoModal.tsx'), 'utf8');
  const aiAssistEditorSource = readFileSync(join(componentsDir, 'editors', 'custom', 'AiAssistEditorBase.tsx'), 'utf8');

  assert.match(
    colorsSource,
    /--settings-collapsible-border: color-mix\(in srgb, var\(--primary\) [^,]+, var\(--grey-darkish\) [^)]+\);/,
  );
  assert.match(
    colorsSource,
    /--settings-collapsible-header-bg: color-mix\(in srgb, var\(--primary\) [^,]+, var\(--grey-darkest\) [^)]+\);/,
  );
  assert.match(
    colorsSource,
    /--settings-collapsible-body-bg: color-mix\(in srgb, var\(--primary\) [^,]+, var\(--grey-darker\) [^)]+\);/,
  );
  assert.match(
    colorsSource,
    /--settings-collapsible-hover-bg: color-mix\(in srgb, var\(--primary\) [^,]+, var\(--grey-darkish\) [^)]+\);/,
  );

  for (const source of [editorGroupSource, projectInfoModalSource, aiAssistEditorSource]) {
    assert.match(source, /border: 1px solid var\(--settings-collapsible-border\);/);
    assert.match(source, /background: var\(--settings-collapsible-header-bg\);/);
    assert.match(source, /background: var\(--settings-collapsible-body-bg\);/);
    assert.match(source, /background: var\(--settings-collapsible-hover-bg\);/);
  }
});

test('node header warning state stays scoped to warning-specific canvas nodes', () => {
  const visualNodeSource = readFileSync(join(componentsDir, 'VisualNode.tsx'), 'utf8');
  const visualNodeImplSource = sliceSourceBetween(
    visualNodeSource,
    'const VisualNodeImpl = memo(',
    'const GetGlobalVisualNode = memo(',
  );
  const getGlobalVisualNodeSource = sliceSourceBetween(
    visualNodeSource,
    'const GetGlobalVisualNode = memo(',
    'const GraphOutputVisualNode = memo(',
  );
  const graphOutputVisualNodeSource = sliceSourceBetween(
    visualNodeSource,
    'const GraphOutputVisualNode = memo(',
    'export const VisualNode = memo(',
  );

  assert.match(visualNodeSource, /const VisualNodeImpl = memo\(/);
  assert.match(visualNodeSource, /const GetGlobalVisualNode = memo\(/);
  assert.match(visualNodeSource, /const GraphOutputVisualNode = memo\(/);
  assert.match(visualNodeSource, /props\.node\.type === 'getGlobal'/);
  assert.match(visualNodeSource, /props\.node\.type === 'graphOutput'/);
  assert.match(getGlobalVisualNodeSource, /enabledStaticGlobalVariableIdsState/);
  assert.match(graphOutputVisualNodeSource, /duplicateGraphOutputIdsState/);
  assert.doesNotMatch(visualNodeImplSource, /enabledStaticGlobalVariableIdsState/);
  assert.doesNotMatch(visualNodeImplSource, /duplicateGraphOutputIdsState/);
});

function sliceSourceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const startIndex = source.indexOf(startNeedle);
  const endIndex = source.indexOf(endNeedle);

  assert.notEqual(startIndex, -1, `Missing source marker: ${startNeedle}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${endNeedle}`);
  assert.ok(startIndex < endIndex, `Expected ${startNeedle} to appear before ${endNeedle}`);

  return source.slice(startIndex, endIndex);
}

test('node code editor uses project-scoped Monaco model caching', () => {
  const codeEditorSource = readFileSync(join(componentsDir, 'editors', 'CodeEditor.tsx'), 'utf8');
  const lazyCodeEditorSource = readFileSync(join(componentsDir, 'CodeEditor.tsx'), 'utf8');
  const workspaceHostSource = readFileSync(join(componentsDir, '..', 'hooks', 'useRivetWorkspaceHost.ts'), 'utf8');

  assert.match(codeEditorSource, /buildCodeEditorModelCacheKey/);
  assert.match(codeEditorSource, /codeEditorModelCacheKey\.js/);
  assert.doesNotMatch(codeEditorSource, /codeEditorModelCache\.js/);
  assert.match(codeEditorSource, /projectId: project\.metadata\.id/);
  assert.match(codeEditorSource, /graphId: graphMetadata\?\.id/);
  assert.match(codeEditorSource, /editorMountKey[\s\S]*modelCacheKey \?\? 'uncached-model'/);
  assert.match(codeEditorSource, /modelCacheKey=\{modelCacheKey\}/);
  assert.match(lazyCodeEditorSource, /getOrCreateCodeEditorModel/);
  assert.match(lazyCodeEditorSource, /const modelUri = modelCacheKey \? monaco\.Uri\.parse\(getCodeEditorModelUri\(modelCacheKey\)\) : undefined/);
  assert.match(lazyCodeEditorSource, /getExistingModel: modelUri \? \(\) => monaco\.editor\.getModel\(modelUri\) : undefined/);
  assert.match(lazyCodeEditorSource, /if \(model\.getValue\(\) !== text\) \{\s+currentOnChange\?\.\(model\.getValue\(\)\);/);
  assert.match(lazyCodeEditorSource, /if \(!isCached\) \{\s+model\.dispose\(\);/);
  assert.match(workspaceHostSource, /function clearCodeEditorModelCacheForClosedProject/);
  assert.match(workspaceHostSource, /clearCodeEditorModelCacheForClosedProject\(currentProjectId\);/);
  assert.match(workspaceHostSource, /clearCodeEditorModelCacheForClosedProject\(projectId\);/);
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

test('node code editor popup widgets are allowed outside the rounded editor shell', () => {
  const codeEditorSource = readFileSync(join(componentsDir, 'CodeEditor.tsx'), 'utf8');
  const defaultNodeEditorSource = readFileSync(join(componentsDir, 'editors', 'DefaultNodeEditor.tsx'), 'utf8');

  assert.doesNotMatch(codeEditorSource, /fixedOverflowWidgets/);
  assert.match(defaultNodeEditorSource, /\.editor-wrapper \{[\s\S]*?overflow: visible;/);
  assert.match(defaultNodeEditorSource, /\.editor-container \{[\s\S]*?border-radius: inherit;[\s\S]*?overflow: visible;/);
  assert.match(defaultNodeEditorSource, /\.node-editor-static-code-editor \.editor-container \{[\s\S]*?overflow: visible;/);
});

test('lazy Monaco editor chunk stays independent from app UI state', () => {
  const codeEditorSource = readFileSync(join(componentsDir, 'CodeEditor.tsx'), 'utf8');
  const lazyComponentsSource = readFileSync(join(componentsDir, 'LazyComponents.tsx'), 'utf8');

  assert.match(lazyComponentsSource, /useMultilineEditorFontSize/);
  assert.match(lazyComponentsSource, /useIsNodeEditorResizing/);
  assert.match(codeEditorSource, /codeEditorMonaco/);
  assert.doesNotMatch(codeEditorSource, /useMultilineEditorFontSize/);
  assert.doesNotMatch(codeEditorSource, /NodeEditorResizeContext/);
  assert.doesNotMatch(codeEditorSource, /codeEditorTheme/);
  assert.doesNotMatch(codeEditorSource, /\.\.\/utils\/monaco\.js/);
  assert.doesNotMatch(codeEditorSource, /\.\.\/state\//);
});
