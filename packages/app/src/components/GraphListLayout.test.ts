import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('graph tree panel keeps the compact text-list layout source contract', () => {
  const graphListSource = readFileSync(join(componentsDir, 'GraphList.tsx'), 'utf8');
  const folderItemSource = readFileSync(join(componentsDir, 'graphList', 'FolderItem.tsx'), 'utf8');

  // This remains a narrow source guard because the project tree is not covered by a render/screenshot test yet.
  // Behavior such as context-menu targeting, folder presentation, reachability, and running state is covered in
  // graph-list helper tests.
  assert.match(graphListSource, /className="project-tree-panel-header"/);
  assert.match(graphListSource, /background-color: var\(--black-seethrough\);/);
  assert.match(graphListSource, /className="project-tree-header"/);
  assert.doesNotMatch(graphListSource, /project-tree-header-tooltip|content={project\.metadata\.title}/);
  assert.doesNotMatch(graphListSource, /className="project-tree-header" title=/);
  assert.match(graphListSource, /<span className="project-tree-header-label">Project:<\/span>/);
  assert.match(graphListSource, /className="graph-list-action"/);
  assert.match(graphListSource, /<span>Project settings<\/span>/);
  assert.match(graphListSource, /className="graph-list-filter"/);
  assert.match(graphListSource, /aria-label="Filter graphs"/);
  assert.match(graphListSource, /placeholder="Filter graphs"/);
  assert.match(graphListSource, /&:focus::placeholder {\s+opacity: 0;\s+}/);
  assert.match(graphListSource, /\.graph-list-action {\s+cursor: pointer;\s+svg {\s+margin-bottom: 0\.35em;/);
  assert.match(graphListSource, /\.spinner \.node-running-indicator {\s+width: var\(--ui-font-size-base\);/);
  assert.match(graphListSource, /\.graph-main-icon {\s+width: 1em;\s+height: 1em;/);
  assert.match(graphListSource, /\.contains-open-graph \.graph-item-select {\s+background-color: color-mix/);
  assert.doesNotMatch(graphListSource, /graph-item-tooltip/);
  assert.doesNotMatch(graphListSource, /metadata!/);
  assert.match(graphListSource, /padding: 8px 10px 8px calc\(10px \+ var\(--graph-item-indent, 0px\)\);/);
  assert.match(graphListSource, /\.folder-children\.with-guide-line::before/);
  assert.match(graphListSource, /left: calc\(10px \+ var\(--graph-item-indent, 0px\) \+ 7px\);/);
  assert.match(graphListSource, /\.folder-children\.with-guide-line::before {[\s\S]*z-index: 1;/);
  assert.doesNotMatch(graphListSource, /iconBefore=|shouldFitContainer/);

  assert.match(folderItemSource, /'--graph-item-indent': `\$\{virtualDepth \* 20\}px`/);
  assert.match(
    folderItemSource,
    /const showChildGuideLine = item\.type === 'folder' && isExpanded && item\.children\.length > 0/,
  );
  assert.match(folderItemSource, /'with-guide-line': showChildGuideLine/);
  assert.match(folderItemSource, /style={folderItemStyle}/);
  assert.doesNotMatch(folderItemSource, /style={graphItemStyle}/);
  assert.match(
    folderItemSource,
    /position: 'relative'[\s\S]*transform: `translate3d\(0, \$\{transform\.y\}px, 0\)`[\s\S]*zIndex: 100/,
  );
  assert.doesNotMatch(folderItemSource, /<Tooltip|GraphItemTooltipContent|title\.split\('\\n'\)\.map/);
  assert.doesNotMatch(folderItemSource, /<div[^>]*title={title}/);
  assert.doesNotMatch(folderItemSource, /className="unreachable-badge" title=/);
  assert.doesNotMatch(folderItemSource, /depthSpacer|range\(/);
});
