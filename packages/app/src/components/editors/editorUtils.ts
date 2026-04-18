import { type ChartNode, type EditorDefinition } from '@ironclad/rivet-core';

export function getHelperMessage(editor: EditorDefinition<ChartNode>, data: ChartNode['data']) {
  return typeof editor.helperMessage === 'function'
    ? editor.helperMessage(data) || undefined
    : editor.helperMessage || undefined;
}

type EditorDefinitionWithDataKey = EditorDefinition<ChartNode> & { dataKey: unknown };

function hasEditorDataKey(editor: EditorDefinition<ChartNode>): editor is EditorDefinitionWithDataKey {
  return 'dataKey' in editor && editor.dataKey != null;
}

export function getEditorListKey(editor: EditorDefinition<ChartNode>, index: number): string {
  if (hasEditorDataKey(editor)) {
    return `${editor.type}:${String(editor.dataKey)}`;
  }

  if (editor.type === 'custom') {
    return `${editor.type}:${editor.customEditorId}`;
  }

  return `${editor.type}:${editor.label}:${index}`;
}
