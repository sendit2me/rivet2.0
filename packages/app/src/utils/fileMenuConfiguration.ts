export type FileMenuItemId =
  | 'new_project'
  | 'open_project'
  | 'save_project'
  | 'save_project_as'
  | 'import_graph'
  | 'export_graph'
  | 'settings';

export type FileMenuItemDefinition = {
  id: FileMenuItemId;
  label: string;
};

export type FileMenuGroupDefinition = readonly FileMenuItemDefinition[];

export type FileMenuConfig = {
  visibleItems?: readonly FileMenuItemId[];
};

export const FILE_MENU_GROUPS = [
  [
    { id: 'new_project', label: 'New project' },
    { id: 'open_project', label: 'Open project' },
  ],
  [
    { id: 'save_project', label: 'Save project' },
    { id: 'save_project_as', label: 'Save project as...' },
  ],
  [
    { id: 'import_graph', label: 'Import graph' },
    { id: 'export_graph', label: 'Export graph' },
  ],
  [{ id: 'settings', label: 'Settings' }],
] as const satisfies readonly FileMenuGroupDefinition[];

export const DEFAULT_FILE_MENU_ITEM_IDS = FILE_MENU_GROUPS.flatMap((group) => group.map((item) => item.id));

export function getVisibleFileMenuGroups(config?: FileMenuConfig): FileMenuGroupDefinition[] {
  const visibleItemIds = new Set<FileMenuItemId>(config?.visibleItems ?? DEFAULT_FILE_MENU_ITEM_IDS);

  return FILE_MENU_GROUPS.map((group) => group.filter((item) => visibleItemIds.has(item.id))).filter(
    (group) => group.length > 0,
  );
}
