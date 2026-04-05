import { useAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { codeEditorHeightsByNodeTypeState } from '../../state/ui.js';
import {
  getDraggedNodeCodeEditorViewportHeight,
  resolveResizableNodeCodeEditorViewportHeight,
} from './nodeEditorCodeEditorSizing.js';

type ResizeHandleMouseEvent = globalThis.MouseEvent;

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
  const resolvedViewportHeight = resolveResizableNodeCodeEditorViewportHeight({
    nodeType,
    editorHeight: defaultHeight,
    persistedHeights: persistedHeightsByNodeType,
  });
  const [viewportHeight, setViewportHeight] = useState(resolvedViewportHeight);

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

    setViewportHeight(
      getDraggedNodeCodeEditorViewportHeight({
        startHeight: dragStartHeight.current,
        startClientY: dragStartClientY.current,
        currentClientY: event.clientY,
      }),
    );
  };

  const onResizeEnd = (event: ResizeHandleMouseEvent) => {
    event.preventDefault();
    dragStartHeight.current = undefined;

    if (nodeType == null || persistedHeightsByNodeType[nodeType] === viewportHeight) {
      return;
    }

    setPersistedHeightsByNodeType((previous) => ({
      ...previous,
      [nodeType]: viewportHeight,
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
