import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('graph tree panel keeps the compact text-list layout', () => {
  const graphListSource = readFileSync(join(componentsDir, 'GraphList.tsx'), 'utf8');
  const folderItemSource = readFileSync(join(componentsDir, 'graphList', 'FolderItem.tsx'), 'utf8');

  assert.match(graphListSource, /className="project-tree-panel-header"/);
  assert.match(graphListSource, /background-color: var\(--black-seethrough\);/);
  assert.match(graphListSource, /className="project-tree-header"/);
  assert.match(graphListSource, /<span className="project-tree-header-label">Project:<\/span>/);
  assert.match(graphListSource, /className="graph-list-action"/);
  assert.match(graphListSource, /<span>Project settings<\/span>/);
  assert.match(graphListSource, /className="graph-list-filter"/);
  assert.match(graphListSource, /aria-label="Filter graphs"/);
  assert.match(graphListSource, /placeholder="Filter graphs"/);
  assert.match(graphListSource, /&:focus::placeholder {\s+opacity: 0;\s+}/);
  assert.match(graphListSource, /\.graph-list-action {\s+cursor: pointer;\s+svg {\s+margin-bottom: 0\.35em;/);
  assert.match(graphListSource, /\.spinner \.node-running-indicator {\s+width: var\(--ui-font-size-base\);/);
  assert.match(graphListSource, /padding: 8px 10px 8px calc\(10px \+ var\(--graph-item-indent, 0px\)\);/);
  assert.doesNotMatch(graphListSource, /iconBefore=|shouldFitContainer/);

  assert.match(folderItemSource, /'--graph-item-indent': `\$\{virtualDepth \* 20\}px`/);
  assert.doesNotMatch(folderItemSource, /depthSpacer|range\(/);
});
