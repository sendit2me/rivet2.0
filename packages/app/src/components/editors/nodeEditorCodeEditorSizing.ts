export const DEFAULT_NODE_CODE_EDITOR_VIEWPORT_HEIGHT = 500;
export const MIN_NODE_CODE_EDITOR_VIEWPORT_HEIGHT = 200;

const RESIZABLE_NODE_CODE_EDITOR_LANGUAGES = new Set(['javascript', 'json']);

function isValidStoredHeight(height: number | undefined): height is number {
  return typeof height === 'number' && Number.isFinite(height) && height > 0;
}

export function isResizableNodeCodeEditorLanguage(language: string | undefined): boolean {
  return typeof language === 'string' && RESIZABLE_NODE_CODE_EDITOR_LANGUAGES.has(language);
}

export function clampNodeCodeEditorViewportHeight(height: number): number {
  return Math.max(MIN_NODE_CODE_EDITOR_VIEWPORT_HEIGHT, Math.round(height));
}

export function getDraggedNodeCodeEditorViewportHeight({
  startHeight,
  startClientY,
  currentClientY,
}: {
  startHeight: number;
  startClientY: number;
  currentClientY: number;
}): number {
  return clampNodeCodeEditorViewportHeight(startHeight + (currentClientY - startClientY));
}

export function resolveResizableNodeCodeEditorViewportHeight({
  nodeType,
  editorHeight,
  persistedHeights,
}: {
  nodeType: string | undefined;
  editorHeight: number | undefined;
  persistedHeights: Record<string, number>;
}): number {
  const persistedHeight = nodeType ? persistedHeights[nodeType] : undefined;

  if (isValidStoredHeight(persistedHeight)) {
    return clampNodeCodeEditorViewportHeight(persistedHeight);
  }

  if (isValidStoredHeight(editorHeight)) {
    return clampNodeCodeEditorViewportHeight(editorHeight);
  }

  return DEFAULT_NODE_CODE_EDITOR_VIEWPORT_HEIGHT;
}
