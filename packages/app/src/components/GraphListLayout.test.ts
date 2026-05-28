import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('graph tree panel keeps the compact text-list layout source contract', () => {
  const graphListSource = readFileSync(join(componentsDir, 'GraphList.tsx'), 'utf8');
  const folderItemSource = readFileSync(join(componentsDir, 'graphList', 'FolderItem.tsx'), 'utf8');
  const graphListContextMenuSource = readFileSync(join(componentsDir, 'graphList', 'graphListContextMenu.ts'), 'utf8');

  // This remains a narrow source guard because the project tree is not covered by a render/screenshot test yet.
  // Behavior such as context-menu targeting, folder presentation, reachability, and running state is covered in
  // graph-list helper tests.
  assert.match(graphListSource, /className="project-tree-panel-header"/);
  assert.match(graphListSource, /background-color: var\(--black-seethrough\);/);
  assert.match(graphListSource, /className="project-tree-header"/);
  assert.doesNotMatch(graphListSource, /project-tree-header-tooltip|content={project\.metadata\.title}/);
  assert.doesNotMatch(graphListSource, /className="project-tree-header" title=/);
  assert.match(graphListSource, /<span className="project-tree-header-label">Project:<\/span>/);
  assert.match(graphListSource, /content="Search \(Ctrl\/Cmd\+F\)"/);
  assert.match(graphListSource, /setGraphSearch\(openOrFocusGraphSearchState\)/);
  assert.match(graphListSource, /<span>Search<\/span>[\s\S]*<span>Project settings<\/span>/);
  assert.match(graphListSource, /className="graph-list-action"/);
  assert.match(graphListSource, /<span>Project settings<\/span>/);
  assert.match(graphListSource, /className="graph-list-filter"/);
  assert.match(graphListSource, /aria-label="Filter graphs"/);
  assert.match(graphListSource, /placeholder="Filter graphs"/);
  assert.match(graphListSource, /onKeyDown={handleGraphListKeyDown}/);
  assert.match(graphListSource, /onMouseDown={handleGraphListMouseDown}/);
  assert.match(graphListSource, /tabIndex={-1}/);
  assert.match(graphListSource, /if \(e\.button !== 0\) {\s+return;\s+}/);
  assert.match(graphListSource, /e\.key !== 'F2'/);
  assert.match(graphListSource, /isInteractiveGraphListTarget\(e\.target\)/);
  assert.match(graphListSource, /setSearchText\(''\);/);
  assert.match(graphListSource, /startRename\(currentGraphListName\)/);
  assert.match(graphListSource, /cancelRename/);
  assert.match(graphListSource, /<PopupMenuItem\b/);
  assert.doesNotMatch(graphListSource, /from '\.\/ContextMenu'/);
  assert.doesNotMatch(graphListSource, /<ContextMenuItem\b/);
  assert.match(graphListContextMenuSource, /export type GraphListContextMenuItem =/);
  assert.doesNotMatch(graphListContextMenuSource, /useContextMenuConfiguration/);
  assert.match(graphListSource, /&:focus::placeholder {\s+opacity: 0;\s+}/);
  assert.match(graphListSource, /\.graph-list-action {\s+cursor: pointer;\s+}/);
  assert.match(graphListSource, /\.graph-list-action-icon-adjusted {\s+margin-bottom: 0\.35em;\s+}/);
  assert.match(graphListSource, /<SettingsCogIcon aria-hidden="true" className="graph-list-action-icon-adjusted" \/>/);
  assert.match(graphListSource, /\.spinner \.node-running-indicator {\s+width: var\(--ui-font-size-base\);/);
  assert.match(
    graphListSource,
    /\.graph-main-icon {\s+width: 1em;\s+height: 1em;[\s\S]*transform: translateY\(-1px\);/,
  );
  assert.match(
    graphListSource,
    /--collapsed-open-graph-folder-color: color-mix\(in srgb, var\(--primary\) 28%, transparent\);/,
  );
  assert.match(
    graphListSource,
    /\.contains-open-graph \.graph-item-select {\s+background-color: var\(--collapsed-open-graph-folder-color\);/,
  );
  assert.match(
    graphListSource,
    /\.graph-reference-dot\.folder-reference-dot {\s+background: var\(--collapsed-open-graph-folder-color\);/,
  );
  assert.doesNotMatch(graphListSource, /graph-item-tooltip/);
  assert.doesNotMatch(graphListSource, /metadata!/);
  assert.match(graphListSource, /padding: 8px 10px 8px calc\(10px \+ var\(--graph-item-indent, 0px\)\);/);
  assert.match(graphListSource, /\.folder-children\.with-guide-line::before/);
  assert.match(graphListSource, /left: calc\(10px \+ var\(--graph-item-indent, 0px\) \+ 7px\);/);
  assert.match(graphListSource, /\.folder-children\.with-guide-line::before {[\s\S]*z-index: 1;/);
  assert.doesNotMatch(graphListSource, /iconBefore=|shouldFitContainer/);

  assert.match(folderItemSource, /'--graph-item-indent': `\$\{virtualDepth \* 20\}px`/);
  assert.match(folderItemSource, /containsReferencingSelectedGraph/);
  assert.match(folderItemSource, /'folder-reference-dot': containsReferencingSelectedGraph/);
  assert.match(folderItemSource, /onCancel={onCancelRename}/);
  assert.match(folderItemSource, /onBlur={handleRenameBlur}/);
  assert.match(folderItemSource, /addEventListener\('pointerdown', handleOutsidePointerDown, true\)/);
  assert.match(folderItemSource, /e\.key === 'Escape'/);
  assert.match(folderItemSource, /onCancel\(\);/);
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
