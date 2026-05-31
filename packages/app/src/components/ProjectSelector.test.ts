import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = dirname(fileURLToPath(import.meta.url));

test('project top bar owns the graph tree sidebar toggle for the active project workspace', () => {
  const projectSelectorTsx = readFileSync(join(srcDir, 'ProjectSelector.tsx'), 'utf8');
  const leftSidebarTsx = readFileSync(join(srcDir, 'LeftSidebar.tsx'), 'utf8');
  const overlayTabsTsx = readFileSync(join(srcDir, 'OverlayTabs.tsx'), 'utf8');

  assert.match(
    projectSelectorTsx,
    /{projectTabsSelected && <GraphTreeSidebarToggle \/>}[\s\S]*{projectTabsSelected && <GraphHistoryControls \/>}[\s\S]*{reserveSidebarColumn && <div className="sidebar-panel-spacer" aria-hidden="true" \/>}[\s\S]*{showFileMenu && <ProjectFileMenu \/>}/,
  );
  assert.match(projectSelectorTsx, /const reserveSidebarColumn = projectTabsSelected && sidebarOpen;/);
  assert.match(projectSelectorTsx, /const showFileMenu = !isInTauri\(\) \|\| isWindowsPlatform\(\);/);
  assert.match(projectSelectorTsx, /const showWindowsWindowControls = isInTauri\(\) && isWindowsPlatform\(\);/);
  assert.match(projectSelectorTsx, /import RivetLogo from '\.\.\/rivet-2-logo-no-background\.svg';/);
  assert.match(projectSelectorTsx, /className={clsx\(\{ 'graph-tree-open': reserveSidebarColumn \}\)}/);
  assert.match(projectSelectorTsx, /--project-selector-strip-bg: var\(--grey-dark-bluish-seethrough\);/);
  assert.match(projectSelectorTsx, /background: var\(--project-selector-strip-bg\);/);
  assert.match(projectSelectorTsx, /&::after \{[\s\S]*left: 0;[\s\S]*right: 0;/);
  assert.match(projectSelectorTsx, /&::after \{[\s\S]*z-index: 2;/);
  assert.match(projectSelectorTsx, /&::after \{[\s\S]*background: var\(--grey-darkish\);/);
  assert.match(projectSelectorTsx, /> \* \{[\s\S]*position: relative;[\s\S]*z-index: 1;/);
  assert.match(projectSelectorTsx, /&\.graph-tree-open::after \{\s+left: var\(--left-sidebar-width\);/);
  assert.match(
    projectSelectorTsx,
    /&\.graph-tree-open \.sidebar-toggle-menu,[\s\S]*&\.graph-tree-open \.graph-history-menu,[\s\S]*&\.graph-tree-open \.sidebar-panel-spacer \{[\s\S]*background: var\(--project-selector-strip-bg\);/,
  );
  assert.match(
    projectSelectorTsx,
    /&\.graph-tree-open \.sidebar-toggle-menu:hover,[\s\S]*&\.graph-tree-open \.graph-history-menu:not\(\.disabled\):hover \{[\s\S]*background: var\(--grey-darkish\);/,
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
  assert.doesNotMatch(projectSelectorTsx, /no-left-controls/);
  assert.doesNotMatch(projectSelectorTsx, /\.project[\s\S]*?border-bottom:/);
  const sidebarToggleStyles = projectSelectorTsx.match(/\.sidebar-toggle-menu \{(?<styles>[\s\S]*?)\n  \}/)
    ?.groups?.styles;
  const graphHistoryStyles = projectSelectorTsx.match(
    /\.graph-history-menu \{(?<styles>[\s\S]*?)\n  \.sidebar-toggle-tooltip/,
  )?.groups?.styles;
  assert.ok(sidebarToggleStyles);
  assert.ok(graphHistoryStyles);
  assert.doesNotMatch(sidebarToggleStyles, /border-right:/);
  assert.doesNotMatch(graphHistoryStyles, /border-right:/);
  assert.match(graphHistoryStyles, /&:not\(\.disabled\):hover \{[\s\S]*background-color: var\(--grey-darkish\);/);
  assert.doesNotMatch(graphHistoryStyles, /opacity: 0\.45;/);
  assert.doesNotMatch(graphHistoryStyles, /\.disabled[\s\S]*background:/);
  assert.match(projectSelectorTsx, /\.graph-history-button \{[\s\S]*&:disabled \{[\s\S]*opacity: 0\.45;/);
  assert.match(projectSelectorTsx, /{showWindowsWindowControls && <WindowsWindowDragRegion \/>}/);
  assert.match(projectSelectorTsx, /{showWindowsWindowControls && <WindowsWindowControls \/>}/);
  assert.match(projectSelectorTsx, /\.projects-container\.empty\.with-window-drag-region \{[\s\S]*flex: 1 1 auto;/);
  assert.match(projectSelectorTsx, /\.window-drag-region \{[\s\S]*flex: 1 0 40px;/);
  assert.match(projectSelectorTsx, /\.windows-window-control \{[\s\S]*width: 46px;/);
  assert.match(projectSelectorTsx, /\.windows-window-control \{[\s\S]*&\.close-window:hover \{[\s\S]*background: #c42b1c;/);
  assert.match(projectSelectorTsx, /\.file-menu \{[\s\S]*border-left: 1px solid var\(--grey-darkest\);/);
  assert.match(projectSelectorTsx, /\.file-menu \{[\s\S]*border-right: 1px solid var\(--grey-darkest\);/);
  assert.match(projectSelectorTsx, /\.file-menu-logo \{[\s\S]*height: 14px;[\s\S]*width: 16px;/);
  assert.match(projectSelectorTsx, /\.project \{[\s\S]*background: var\(--project-selector-strip-bg\);/);
  assert.match(overlayTabsTsx, /background: var\(--project-selector-strip-bg, var\(--grey-dark-bluish-seethrough\)\);/);
  assert.match(projectSelectorTsx, /<img src={RivetLogo} alt="" aria-hidden="true" className="file-menu-logo" \/>/);
  assert.match(projectSelectorTsx, />\s*Menu\s*<\/button>/);
  assert.doesNotMatch(projectSelectorTsx, />\s*File\s*<\/button>/);
  assert.match(projectSelectorTsx, /\.project::after \{[\s\S]*background-color: var\(--grey-darkest\);/);
  assert.doesNotMatch(overlayTabsTsx, /\.menu-item[\s\S]*?border-bottom:/);
  assert.doesNotMatch(overlayTabsTsx, /z-index: 200;/);
  assert.match(overlayTabsTsx, /border-left: 1px solid var\(--grey-darkest\);/);
  assert.match(overlayTabsTsx, /\.menu-item \{[\s\S]*border-right: 1px solid var\(--grey-darkest\);/);
  assert.match(leftSidebarTsx, /id="graph-tree-sidebar"/);
  assert.match(leftSidebarTsx, /border-right: 1px solid var\(--grey-darkish\);/);
  assert.match(leftSidebarTsx, /shouldCollapseLeftSidebarDrag\(rawWidth\)/);
  assert.match(leftSidebarTsx, /\{\(sidebarOpen \|\| isResizing\) && \(/);
  assert.match(
    leftSidebarTsx,
    /if \(resizeSidebarOpenRef\.current\) {\s+setPersistedSidebarWidth\(liveSidebarWidthRef\.current\);\s+} else {\s+setLiveSidebarWidth\(clampLeftSidebarWidth\(persistedSidebarWidth\)\);/,
  );
  assert.doesNotMatch(leftSidebarTsx, /SIDEBAR_TRANSITION_EASING|transition:.*transform/);
  assert.doesNotMatch(leftSidebarTsx, /toggle-tab|menu-expand-left-line|menu-expand-right-line/);
});

test('windows desktop uses the in-strip Menu dropdown instead of a native Tauri menubar', () => {
  const projectSelectorTsx = readFileSync(join(srcDir, 'ProjectSelector.tsx'), 'utf8');
  const platformCoreSource = readFileSync(join(srcDir, '..', 'utils', 'platform', 'core.ts'), 'utf8');
  const windowsHotkeysSource = readFileSync(join(srcDir, '..', 'hooks', 'useWindowsHotkeysFix.tsx'), 'utf8');
  const tauriMainSource = readFileSync(join(srcDir, '..', '..', 'src-tauri', 'src', 'main.rs'), 'utf8');

  assert.match(projectSelectorTsx, /import \{ isWindowsPlatform \} from '\.\.\/utils\/platform\/os\.js';/);
  assert.match(projectSelectorTsx, /import \{ getAppWindowHandle \} from '\.\.\/utils\/platform\/window\.js';/);
  assert.match(projectSelectorTsx, /const showFileMenu = !isInTauri\(\) \|\| isWindowsPlatform\(\);/);
  assert.match(projectSelectorTsx, /const showWindowsWindowControls = isInTauri\(\) && isWindowsPlatform\(\);/);
  assert.match(projectSelectorTsx, /const WindowsWindowControls: FC = \(\) => \{/);
  assert.match(projectSelectorTsx, /appWindow\.minimize\?\.\(\)/);
  assert.match(projectSelectorTsx, /appWindow\.toggleMaximize\?\.\(\)/);
  assert.match(projectSelectorTsx, /appWindow\.close\(\)/);
  assert.match(projectSelectorTsx, /appWindow\?\.startDragging\?\.\(\)/);
  assert.match(projectSelectorTsx, /event\.detail > 1/);
  assert.match(projectSelectorTsx, /onDoubleClick={toggleMaximize}/);
  assert.match(platformCoreSource, /minimize\?\(\): Promise<void>;/);
  assert.match(platformCoreSource, /startDragging\?\(\): Promise<void>;/);
  assert.match(platformCoreSource, /toggleMaximize\?\(\): Promise<void>;/);
  assert.match(windowsHotkeysSource, /import \{ isWindowsPlatform \} from '\.\.\/utils\/platform\/os\.js';/);
  assert.match(tauriMainSource, /#\[cfg\(not\(target_os = "windows"\)\)\]\s+use tauri::\{CustomMenuItem, Menu, MenuItem, Submenu\};/);
  assert.match(tauriMainSource, /#\[cfg\(target_os = "windows"\)\]\s+use tauri_plugin_window_state::StateFlags;/);
  assert.match(tauriMainSource, /\.plugin\(create_window_state_plugin_builder\(\)\.build\(\)\)/);
  assert.match(tauriMainSource, /#\[cfg\(target_os = "windows"\)\]\s+configure_windows_frameless_window\(app\)\?;/);
  assert.match(tauriMainSource, /state_flags\.remove\(StateFlags::DECORATIONS\);/);
  assert.match(tauriMainSource, /fn configure_windows_frameless_window\(app: &mut tauri::App\) -> tauri::Result<\(\)>/);
  assert.match(tauriMainSource, /window\.set_decorations\(false\)\?;/);
  assert.match(tauriMainSource, /#\[cfg\(not\(target_os = "windows"\)\)\]\s+let builder = builder[\s\S]*?\.menu\(create_menu\(\)\)[\s\S]*?\.on_menu_event/);
  assert.match(tauriMainSource, /#\[cfg\(not\(target_os = "windows"\)\)\]\s+fn create_menu\(\) -> Menu/);
});
