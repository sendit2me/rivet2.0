import { useAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { codeEditorHeightsByNodeTypeState } from '../../state/ui.js';

type ResizeHandleMouseEvent = globalThis.MouseEvent;

// Keep this aligned with the static `.node-editor-static-code-editor` fallback
// min-height in `DefaultNodeEditor.tsx` so resizable and non-resizable paths
// stay visually consistent by default.
export const DEFAULT_HEIGHT = 500;
export const MIN_HEIGHT = 200;
export const RESIZABLE_LANGUAGES = new Set(['javascript', 'json', 'prompt-interpolation-markdown']);

export function isValidHeight(height: number | undefined): height is number {
  return typeof height === 'number' && Number.isFinite(height) && height > 0;
}

export function useNodeEditorCodeViewportHeight({
  nodeType,
  defaultHeight,
}: {
  nodeType: string | undefined;
  defaultHeight: number | undefined;
}) {
  const [persistedHeightsByNodeType, setPersistedHeightsByNodeType] = useAtom(codeEditorHeightsByNodeTypeState);
  const dragStartHeight = useRef<number | undefined>(undefined);
  const dragStartClientY = useRef(0);
  const currentViewportHeightRef = useRef<number>(DEFAULT_HEIGHT);
  const persistedHeight = nodeType ? persistedHeightsByNodeType[nodeType] : undefined;
  const resolvedViewportHeight = isValidHeight(persistedHeight)
    ? Math.max(MIN_HEIGHT, Math.round(persistedHeight))
    : isValidHeight(defaultHeight)
      ? Math.max(MIN_HEIGHT, Math.round(defaultHeight))
      : DEFAULT_HEIGHT;
  const [viewportHeight, setViewportHeight] = useState(resolvedViewportHeight);

  currentViewportHeightRef.current = viewportHeight;

  useEffect(() => {
    setViewportHeight(resolvedViewportHeight);
  }, [nodeType, resolvedViewportHeight]);

  const onResizeStart = (event: ResizeHandleMouseEvent) => {
    event.preventDefault();
    dragStartHeight.current = viewportHeight;
    dragStartClientY.current = event.clientY;
  };

  const onResizeMove = (event: ResizeHandleMouseEvent) => {
    event.preventDefault();

    if (dragStartHeight.current == null) {
      return;
    }

    const nextViewportHeight = Math.max(MIN_HEIGHT, Math.round(dragStartHeight.current + (event.clientY - dragStartClientY.current)));
    currentViewportHeightRef.current = nextViewportHeight;
    setViewportHeight(nextViewportHeight);
  };

  const onResizeEnd = (event: ResizeHandleMouseEvent) => {
    event.preventDefault();

    const dragStart = dragStartHeight.current;
    const finalViewportHeight = dragStart == null
      ? currentViewportHeightRef.current
      : Math.max(MIN_HEIGHT, Math.round(dragStart + (event.clientY - dragStartClientY.current)));

    currentViewportHeightRef.current = finalViewportHeight;
    setViewportHeight(finalViewportHeight);
    dragStartHeight.current = undefined;

    if (nodeType == null || persistedHeightsByNodeType[nodeType] === finalViewportHeight) {
      return;
    }

    setPersistedHeightsByNodeType((previous) => ({
      ...previous,
      [nodeType]: finalViewportHeight,
    }));
  };

  return {
    viewportHeight,
    resizeHandleProps: {
      onResizeStart,
      onResizeMove,
      onResizeEnd,
    },
  };
}
