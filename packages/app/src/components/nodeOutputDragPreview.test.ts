import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('drag previews use the same output preview sizing as hovered nodes', () => {
  const visualNodeSource = readFileSync(join(componentsDir, 'VisualNode.tsx'), 'utf8');
  const normalVisualNodeContentSource = readFileSync(
    join(componentsDir, 'visualNode', 'NormalVisualNodeContent.tsx'),
    'utf8',
  );
  const nodeOutputSource = readFileSync(join(componentsDir, 'NodeOutput.tsx'), 'utf8');
  const nodeStylesSource = readFileSync(join(componentsDir, 'nodeStyles.ts'), 'utf8');

  assert.match(
    visualNodeSource,
    /const isOutputPreviewHovered = Boolean\(isHovered \|\| shouldShowHoverControls\);/,
  );
  assert.match(
    normalVisualNodeContentSource,
    /<NodeOutput node=\{node\} suspended=\{!renderHeavyContent\} isHovered=\{isOutputPreviewHovered\} \/>/,
  );
  assert.match(nodeOutputSource, /resolveNodeOutputPreviewMode\(\{\s*isOutputExpanded,\s*isHovered,/);
  assert.match(
    nodeStylesSource,
    /\.node:is\(:hover, \.hovered, \.showHoverControls\) \.node-output-inner,/,
  );
  assert.match(nodeStylesSource, /\.node:is\(:hover, \.hovered, \.showHoverControls\) \.multi-node-output/);
});

test('node drags clear stale canvas hover state', () => {
  const nodeCanvasSource = readFileSync(join(componentsDir, 'NodeCanvas.tsx'), 'utf8');

  assert.match(nodeCanvasSource, /const clearHoveringNode = useStableCallback\(\(\) => \{\s*setHoveringNode\(undefined\);/);
  assert.match(
    nodeCanvasSource,
    /const syncHoveringNodeFromPointer = useStableCallback\(\(\) => \{[\s\S]*?document\.elementFromPoint\(lastMouseInfoRef\.current\.x, lastMouseInfoRef\.current\.y\);[\s\S]*?\.node\[data-nodeid\]:not\(\.overlayNode\)/,
  );
  assert.match(nodeCanvasSource, /const hoverSyncAnimationFrameRef = useRef<number \| undefined>\(\);/);
  assert.match(nodeCanvasSource, /window\.cancelAnimationFrame\(hoverSyncAnimationFrameRef\.current\);/);
  assert.match(
    nodeCanvasSource,
    /const preserveMoveDragHoverOnDrop = useStableCallback\(\(nodeId: NodeId\) => \{[\s\S]*?if \(dragMode === 'move'\) \{[\s\S]*?setHoveringNode\(nodeId\);/,
  );
  assert.match(nodeCanvasSource, /onDragStart=\{\(event\) => \{[\s\S]*?onNodeStartDrag\(event\);[\s\S]*?clearHoveringNode\(\);/);
  assert.match(nodeCanvasSource, /onDragEnd=\{\(event\) => \{[\s\S]*?clearNodeDragGesture\(\);[\s\S]*?preserveMoveDragHoverOnDrop\(event\.active\.id as NodeId\);[\s\S]*?try \{[\s\S]*?onNodeDragged\(event\);[\s\S]*?\} finally \{[\s\S]*?syncHoveringNodeFromPointer\(\);/);
  assert.match(nodeCanvasSource, /onDragCancel=\{\(\) => \{[\s\S]*?clearNodeDragGesture\(\);[\s\S]*?try \{[\s\S]*?onNodeDragCancelled\(\);[\s\S]*?\} finally \{[\s\S]*?syncHoveringNodeFromPointer\(\);/);
});

test('node output content fade only replays for unseen output content', () => {
  const nodeOutputSource = readFileSync(join(componentsDir, 'NodeOutput.tsx'), 'utf8');

  assert.match(nodeOutputSource, /const seenNodeOutputContentKeys = new Set<string>\(\);/);
  assert.match(nodeOutputSource, /const shouldAnimateRef = useRef\(!seenNodeOutputContentKeys\.has\(contentKey\)\);/);
  assert.match(nodeOutputSource, /rememberNodeOutputContentKey\(contentKey\);/);
  assert.match(nodeOutputSource, /<NodeOutputContentFade key=\{contentKey\} contentKey=\{contentKey\}>/);
  assert.match(nodeOutputSource, /&\.animate-node-output-content \{\s*animation: node-output-content-fade-in 140ms ease-out both;/);
});
