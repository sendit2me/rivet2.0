import type { MenuIds } from './menuCommandIds.js';
import type { OverlayKey } from '../state/ui.js';

const menuCommandProjectScope = {
  settings: false,
  quit: false,
  new_project: false,
  open_project: false,
  save_project: true,
  save_project_as: true,
  export_graph: true,
  import_graph: true,
  run: true,
  load_recording: true,
  remote_debugger: true,
  toggle_devtools: false,
  clear_outputs: true,
  get_help: false,
} satisfies Record<MenuIds, boolean>;

export function isProjectWorkspaceSelected({
  openOverlay,
  openProjectCount,
}: {
  openOverlay: OverlayKey | undefined;
  openProjectCount: number;
}) {
  return openOverlay === undefined && openProjectCount > 0;
}

export function isProjectScopedMenuCommand(command: MenuIds) {
  return menuCommandProjectScope[command];
}

export function shouldRunMenuCommandForProjectSelection({
  command,
  projectWorkspaceSelected,
}: {
  command: MenuIds;
  projectWorkspaceSelected: boolean;
}) {
  return projectWorkspaceSelected || !isProjectScopedMenuCommand(command);
}
