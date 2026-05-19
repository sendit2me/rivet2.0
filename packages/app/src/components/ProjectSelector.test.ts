import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = dirname(fileURLToPath(import.meta.url));

test('project top bar owns the graph tree sidebar toggle for the active project workspace', () => {
  const projectSelectorTsx = readFileSync(join(srcDir, 'ProjectSelector.tsx'), 'utf8');
  const leftSidebarTsx = readFileSync(join(srcDir, 'LeftSidebar.tsx'), 'utf8');

  assert.match(
    projectSelectorTsx,
    /{projectTabsSelected && <GraphTreeSidebarToggle \/>}[\s\S]*{!isInTauri\(\) && <ProjectFileMenu \/>}/,
  );
  assert.match(projectSelectorTsx, /aria-controls="graph-tree-sidebar"/);
  assert.match(projectSelectorTsx, /aria-expanded={sidebarOpen}/);
  assert.match(projectSelectorTsx, /const actionLabel = sidebarOpen \? 'Collapse graph tree' : 'Expand graph tree';/);
  assert.match(projectSelectorTsx, /const actionTitle = `\$\{actionLabel\} \(\$\{GRAPH_TREE_TOGGLE_SHORTCUT_LABEL\}\)`;/);
  assert.match(projectSelectorTsx, /aria-label={actionLabel}/);
  assert.match(projectSelectorTsx, /<Tooltip content={actionTitle} placement="bottom" className="sidebar-toggle-tooltip">/);
  assert.match(projectSelectorTsx, /\.sidebar-toggle-tooltip {\s+display: flex;\s+width: 100%;\s+height: 100%;/);
  assert.doesNotMatch(projectSelectorTsx, /title={actionTitle}/);
  assert.match(projectSelectorTsx, /const GraphTreeSidebarIcon: FC<{ sidebarOpen: boolean }>/);
  assert.match(projectSelectorTsx, /<rect x="2\.75" y="3\.5" width="10\.5" height="9" rx="1\.25"/);
  assert.match(projectSelectorTsx, /d={sidebarOpen \? 'M5\.25 4\.75v6\.5' : 'M7\.25 4\.75v6\.5'}/);
  assert.match(leftSidebarTsx, /id="graph-tree-sidebar"/);
  assert.match(leftSidebarTsx, /const SIDEBAR_TRANSITION_EASING = 'cubic-bezier\(0\.2, 0\.95, 0\.22, 1\.12\)'/);
  assert.match(leftSidebarTsx, /transition: isResizing \? 'none' : `transform 0\.3s \$\{SIDEBAR_TRANSITION_EASING\}`/);
  assert.doesNotMatch(leftSidebarTsx, /toggle-tab|menu-expand-left-line|menu-expand-right-line/);
});
