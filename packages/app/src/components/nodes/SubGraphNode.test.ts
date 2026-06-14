import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const subGraphNodeSource = readFileSync(new URL('./SubGraphNode.tsx', import.meta.url), 'utf8');
const useNodeTypesSource = readFileSync(new URL('../../hooks/useNodeTypes.ts', import.meta.url), 'utf8');
const coreSubGraphNodeSource = readFileSync(
  new URL('../../../../core/src/model/nodes/SubGraphNode.ts', import.meta.url),
  'utf8',
);

test('subgraph node keeps the settings-panel graph selector as the source editor', () => {
  assert.match(coreSubGraphNodeSource, /type: 'graphSelector'/);
  assert.match(coreSubGraphNodeSource, /label: 'Graph'/);
  assert.match(coreSubGraphNodeSource, /dataKey: 'graphId'/);
});

test('subgraph node canvas body mirrors graphId with a compact selector', () => {
  assert.match(subGraphNodeSource, /useEditNodeCommand\(\)/);
  assert.match(subGraphNodeSource, /projectState/);
  assert.match(subGraphNodeSource, /getProjectGraphSelectorOptions\(project\.graphs, \{/);
  assert.match(subGraphNodeSource, /aria-label="Subgraph graph"/);
  assert.match(subGraphNodeSource, /<select[\s\S]*?className="subgraph-node-body-select"/);
  assert.match(subGraphNodeSource, /graphId,/);
  assert.match(subGraphNodeSource, /data: \{[\s\S]*?\.\.\.node\.data[\s\S]*?graphId,/);
  assert.match(subGraphNodeSource, /font-family: var\(--font-family-monospace\);/);
  assert.doesNotMatch(subGraphNodeSource, /font-weight: 700;/);
  assert.doesNotMatch(subGraphNodeSource, /font-family: var\(--font-family\);/);
});

test('subgraph node canvas selector preserves stale graph ids visibly', () => {
  assert.match(subGraphNodeSource, /includeMissingSelectedGraph: true/);
  assert.match(subGraphNodeSource, /selectedGraphId: node\.data\.graphId/);
});

test('subgraph node selector handles focus and double-click like other canvas controls', () => {
  assert.match(subGraphNodeSource, /if \(!isSelectFocused\) \{[\s\S]*?return;[\s\S]*?\}/);
  assert.match(subGraphNodeSource, /document\.addEventListener\('pointerdown', handleDocumentPointerDown, true\)/);
  assert.match(subGraphNodeSource, /rootRef\.current\?\.closest<HTMLElement>\('\.node'\)/);
  assert.match(subGraphNodeSource, /nodeElement\?\.contains\(event\.target\)/);
  assert.match(subGraphNodeSource, /selectElement\.blur\(\)/);
  assert.match(subGraphNodeSource, /document\.removeEventListener\('pointerdown', handleDocumentPointerDown, true\)/);
  assert.match(subGraphNodeSource, /onFocus=\{\(\) => setIsSelectFocused\(true\)\}/);
  assert.match(subGraphNodeSource, /onBlur=\{\(\) => setIsSelectFocused\(false\)\}/);
  assert.match(subGraphNodeSource, /className="subgraph-node-body-select-wrap" onDoubleClick=\{handleSelectDoubleClick\}/);
  assert.match(subGraphNodeSource, /event\.stopPropagation\(\)/);
});

test('subgraph node descriptor remains registered for custom canvas body rendering', () => {
  assert.match(useNodeTypesSource, /import \{ subgraphNodeDescriptor \} from '\.\.\/components\/nodes\/SubGraphNode\.js';/);
  assert.match(useNodeTypesSource, /subGraph: subgraphNodeDescriptor,/);
});
