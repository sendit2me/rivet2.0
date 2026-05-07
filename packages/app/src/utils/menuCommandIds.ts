export const MENU_COMMAND_IDS = [
  'settings',
  'quit',
  'new_project',
  'open_project',
  'save_project',
  'save_project_as',
  'export_graph',
  'import_graph',
  'run',
  'load_recording',
  'remote_debugger',
  'toggle_devtools',
  'clear_outputs',
  'get_help',
] as const;

export type MenuIds = (typeof MENU_COMMAND_IDS)[number];
