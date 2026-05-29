import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canStartWireDragFromPortLabel } from './Port.js';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('canStartWireDragFromPortLabel only allows wire starts from output labels', () => {
  assert.equal(canStartWireDragFromPortLabel(false), true);
  assert.equal(canStartWireDragFromPortLabel(true), false);
});

test('conditional node ports render without the redundant if label', () => {
  const portSource = readFileSync(join(componentsDir, 'Port.tsx'), 'utf8');
  const nodeStylesSource = readFileSync(join(componentsDir, 'nodeStyles.ts'), 'utf8');
  const normalNodeSource = readFileSync(join(componentsDir, 'visualNode', 'NormalVisualNodeContent.tsx'), 'utf8');
  const zoomedOutNodeSource = readFileSync(join(componentsDir, 'visualNode', 'ZoomedOutVisualNodeContent.tsx'), 'utf8');

  assert.match(portSource, /hideLabel = false/);
  assert.match(portSource, /!\s*hideLabel && \(/);
  assert.match(normalNodeSource, /title="if"[\s\S]*hideLabel[\s\S]*input/);
  assert.match(zoomedOutNodeSource, /title="if"[\s\S]*hideLabel[\s\S]*input/);
  assert.doesNotMatch(nodeStylesSource, /\.node\.conditional \.node-title/);
});

test('subgraph port labels expose reorder drag only in explicit rearrange mode', () => {
  const portSource = readFileSync(join(componentsDir, 'Port.tsx'), 'utf8');
  const nodeCanvasSource = readFileSync(join(componentsDir, 'NodeCanvas.tsx'), 'utf8');
  const nodePortsSource = readFileSync(join(componentsDir, 'NodePorts.tsx'), 'utf8');
  const nodeStylesSource = readFileSync(join(componentsDir, 'nodeStyles.ts'), 'utf8');
  const appSrcDir = dirname(componentsDir);
  const contextMenuConfigurationSource = readFileSync(
    join(appSrcDir, 'hooks', 'useContextMenuConfiguration.ts'),
    'utf8',
  );
  const contextMenuHandlerSource = readFileSync(join(appSrcDir, 'hooks', 'useGraphBuilderContextMenuHandler.ts'), 'utf8');

  assert.match(portSource, /className=\{clsx\('port-label'/);
  assert.doesNotMatch(portSource, /draggable=\{reorderable\}/);
  assert.doesNotMatch(portSource, /onDragStart=/);
  assert.match(portSource, /onReorderMouseDown\?\.\(event, id, input, title\)/);
  assert.match(portSource, /data-reorder-nodeid=\{reorderable \? nodeId : undefined\}/);
  assert.match(portSource, /className=\{clsx\('port-circle'/);
  assert.match(portSource, /onMouseDown=\{\(e\) => \{\s*return onMouseDown\?\.\(e, id, input\);/);
  assert.match(nodePortsSource, /const isSubGraphNode = node\.type === 'subGraph';/);
  assert.match(nodePortsSource, /subGraphPortRearrangeTargetState/);
  assert.match(nodePortsSource, /const isRearrangingSubGraphPorts =/);
  assert.match(nodePortsSource, /reorderable=\{isRearrangingSubGraphPorts\}/);
  assert.match(nodePortsSource, /className=\{`node-ports\$\{isRearrangingSubGraphPorts \? ' subgraph-port-rearrange-mode' : ''\}`\}/);
  assert.match(nodePortsSource, /document\.addEventListener\('pointerdown', handlePointerDown, true\)/);
  assert.match(nodePortsSource, /setSubGraphPortRearrangeTarget\(undefined\)/);
  assert.match(nodePortsSource, /subGraphPortRearrangeTarget\?\.projectId === projectId/);
  assert.match(nodeCanvasSource, /subGraphPortRearrangeTargetState/);
  assert.match(nodeCanvasSource, /subGraphPortRearrangeTarget\.projectId !== project\.metadata\.id/);
  assert.match(nodeCanvasSource, /subGraphPortRearrangeTarget\.graphId !== selectedGraphMetadata\?\.id/);
  assert.match(nodeCanvasSource, /!nodes\.some\(\(node\) => node\.id === subGraphPortRearrangeTarget\.nodeId\)/);
  assert.match(nodePortsSource, /document\.querySelectorAll<HTMLElement>\('\[data-reorder-nodeid\]\[data-reorder-portid\]'\)/);
  assert.match(nodePortsSource, /getSubGraphPortOrderFromPoint/);
  assert.match(nodePortsSource, /moveSubGraphPortIdToIndexInOrder/);
  assert.match(nodePortsSource, /window\.addEventListener\('mousemove'/);
  assert.match(nodePortsSource, /window\.addEventListener\('mouseup'/);
  assert.match(nodePortsSource, /createPortal\(/);
  assert.match(nodePortsSource, /document\.body/);
  assert.match(nodePortsSource, /position: 'fixed'/);
  assert.match(nodePortsSource, /const labelRect = event\.currentTarget\.getBoundingClientRect\(\);/);
  assert.match(nodePortsSource, /pointerOffsetX: event\.clientX - labelRect\.left/);
  assert.match(nodePortsSource, /pointerOffsetY: event\.clientY - labelRect\.top/);
  assert.match(nodePortsSource, /left: draggedPort\.clientX - draggedPort\.pointerOffsetX/);
  assert.match(nodePortsSource, /top: draggedPort\.clientY - draggedPort\.pointerOffsetY/);
  assert.match(nodePortsSource, /width: draggedPort\.width/);
  assert.match(nodePortsSource, /isSubGraphErrorOutputDefinition/);
  assert.match(nodePortsSource, /outputDefinitions\.filter\(\(output\) => !isSubGraphErrorOutputDefinition\(node, output\)\)/);
  assert.match(nodePortsSource, /useEditNodeCommand\(\)/);
  assert.match(nodePortsSource, /mergeWithPrevious: false/);
  assert.match(contextMenuConfigurationSource, /id: 'node-rearrange-subgraph-ports'[\s\S]*label: 'Rearrange inputs\/outputs'/);
  assert.match(contextMenuConfigurationSource, /conditional: canRearrangeSubgraphPorts/);
  assert.match(contextMenuHandlerSource, /\.with\('node-rearrange-subgraph-ports'/);
  assert.match(contextMenuHandlerSource, /setSubGraphPortRearrangeTarget\(\{ graphId, nodeId, projectId: project\.metadata\.id \}\)/);
  assert.doesNotMatch(nodeStylesSource, /\.node-ports\.subgraph-port-rearrange-mode[\s\S]*outline:/);
  assert.match(nodeStylesSource, /\.port\.reorderable \.port-label \{/);
  assert.match(nodeStylesSource, /background: color-mix\(in srgb, var\(--primary\) 18%, var\(--grey-darkest\) 82%\);/);
  assert.match(nodeStylesSource, /border-radius: calc\(6px \* var\(--ui-font-scale\)\);/);
  assert.match(nodeStylesSource, /\.port\.reorder-dragging-source \.port-label \{[\s\S]*?visibility: hidden;/);
  assert.match(nodeStylesSource, /body\.subgraph-port-reorder-dragging/);
});
