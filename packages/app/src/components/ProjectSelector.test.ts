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
    /{projectTabsSelected && <GraphTreeSidebarToggle \/>}[\s\S]*{projectTabsSelected && <GraphHistoryControls \/>}[\s\S]*{reserveSidebarColumn && \([\s\S]*className={clsx\('sidebar-panel-spacer', \{ 'no-left-controls': !projectTabsSelected \}\)}[\s\S]*{!isInTauri\(\) && <ProjectFileMenu \/>}/,
  );
  assert.match(projectSelectorTsx, /aria-controls="graph-tree-sidebar"/);
  assert.match(projectSelectorTsx, /aria-expanded={sidebarOpen}/);
  assert.match(projectSelectorTsx, /const actionLabel = sidebarOpen \? 'Collapse graph tree' : 'Expand graph tree';/);
  assert.match(
    projectSelectorTsx,
    /const actionTitle = `\$\{actionLabel\} \(\$\{GRAPH_TREE_TOGGLE_SHORTCUT_LABEL\}\)`;/,
  );
  assert.match(projectSelectorTsx, /aria-label={actionLabel}/);
  assert.match(
    projectSelectorTsx,
    /<Tooltip content={actionTitle} placement="bottom" className="sidebar-toggle-tooltip">/,
  );
  assert.match(projectSelectorTsx, /\.sidebar-toggle-tooltip {\s+display: flex;\s+width: 100%;\s+height: 100%;/);
  assert.doesNotMatch(projectSelectorTsx, /title={actionTitle}/);
  assert.match(projectSelectorTsx, /const GraphTreeSidebarIcon: FC<{ sidebarOpen: boolean }>/);
  assert.match(projectSelectorTsx, /<rect x="2\.75" y="3\.5" width="10\.5" height="9" rx="1\.25"/);
  assert.match(projectSelectorTsx, /d={sidebarOpen \? 'M5\.25 4\.75v6\.5' : 'M7\.25 4\.75v6\.5'}/);
  assert.match(projectSelectorTsx, /const GraphHistoryControls: FC = \(\) => {/);
  assert.match(projectSelectorTsx, /<GraphHistoryButton[\s\S]*?disabled={!navigationStack\.hasBackward}/);
  assert.match(projectSelectorTsx, /<GraphHistoryButton[\s\S]*?disabled={!navigationStack\.hasForward}/);
  assert.match(projectSelectorTsx, /tooltip={GRAPH_HISTORY_PREVIOUS_TOOLTIP}/);
  assert.match(projectSelectorTsx, /tooltip={GRAPH_HISTORY_NEXT_TOOLTIP}/);
  assert.match(projectSelectorTsx, /<button[\s\S]*?aria-label={label}[\s\S]*?disabled={disabled}/);
  assert.match(projectSelectorTsx, /onClick={disabled \? undefined : onClick}/);
  assert.match(
    projectSelectorTsx,
    /flex: 0 0 max\(0px, calc\(var\(--left-sidebar-width\) - var\(--top-bar-left-controls-width\)\)\);/,
  );
  assert.match(
    projectSelectorTsx,
    /\.sidebar-panel-spacer\.no-left-controls {\s+flex-basis: var\(--left-sidebar-width\);/,
  );
  assert.match(leftSidebarTsx, /id="graph-tree-sidebar"/);
  assert.match(leftSidebarTsx, /shouldCollapseLeftSidebarDrag\(rawWidth\)/);
  assert.match(leftSidebarTsx, /\{\(sidebarOpen \|\| isResizing\) && \(/);
  assert.match(
    leftSidebarTsx,
    /if \(resizeSidebarOpenRef\.current\) {\s+setPersistedSidebarWidth\(liveSidebarWidthRef\.current\);\s+} else {\s+setLiveSidebarWidth\(clampLeftSidebarWidth\(persistedSidebarWidth\)\);/,
  );
  assert.doesNotMatch(leftSidebarTsx, /SIDEBAR_TRANSITION_EASING|transition:.*transform/);
  assert.doesNotMatch(leftSidebarTsx, /toggle-tab|menu-expand-left-line|menu-expand-right-line/);
});
