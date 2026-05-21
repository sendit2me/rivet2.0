export type ToggleEditorDataChangeDefinition = {
  dataKey: string;
  turnOffDataKeysWhenEnabled?: string[];
};

export function applyToggleEditorChange(
  data: Record<string, unknown>,
  editor: ToggleEditorDataChangeDefinition,
  value: boolean,
): Record<string, unknown> {
  const nextData = {
    ...data,
    [editor.dataKey]: value,
  };

  if (value) {
    for (const dataKey of editor.turnOffDataKeysWhenEnabled ?? []) {
      nextData[dataKey] = false;
    }
  }

  return nextData;
}
