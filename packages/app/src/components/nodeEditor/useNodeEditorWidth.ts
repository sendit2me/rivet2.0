import { useAtom } from 'jotai';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { nodeEditorWidthState } from '../../state/ui.js';

type ResizeHandleMouseEvent = globalThis.MouseEvent;

export const DEFAULT_WIDTH_RATIO = 0.45;
export const MIN_WIDTH = 500;
export const MAX_WIDTH = 1000;
export const MIN_CANVAS_WIDTH = 320;

export function isValidWidth(width: number | null | undefined): width is number {
  return typeof width === 'number' && Number.isFinite(width) && width > 0;
}

export function clampNodeEditorWidth(width: number, viewportWidth: number): number {
  const maxWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(viewportWidth - MIN_CANVAS_WIDTH)));
  return Math.max(MIN_WIDTH, Math.min(maxWidth, Math.round(width)));
}

export function resolveNodeEditorWidth({
  persistedWidth,
  viewportWidth,
}: {
  persistedWidth: number | null | undefined;
  viewportWidth: number;
}): number {
  const preferredWidth = isValidWidth(persistedWidth) ? persistedWidth : viewportWidth * DEFAULT_WIDTH_RATIO;
  return clampNodeEditorWidth(preferredWidth, viewportWidth);
}

export function dragNodeEditorWidth({
  startWidth,
  startClientX,
  currentClientX,
  viewportWidth,
}: {
  startWidth: number;
  startClientX: number;
  currentClientX: number;
  viewportWidth: number;
}): number {
  return clampNodeEditorWidth(startWidth + (startClientX - currentClientX), viewportWidth);
}

export function useNodeEditorWidth() {
  const [persistedWidth, setPersistedWidth] = useAtom(nodeEditorWidthState);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const dragStartWidth = useRef<number | undefined>(undefined);
  const dragStartClientX = useRef(0);
  const viewportWidthRef = useRef(viewportWidth);
  const resolvedWidth = resolveNodeEditorWidth({ persistedWidth, viewportWidth });
  const [panelWidth, setPanelWidth] = useState(resolvedWidth);
  const currentPanelWidthRef = useRef(panelWidth);

  currentPanelWidthRef.current = panelWidth;
  viewportWidthRef.current = viewportWidth;

  useLayoutEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    setPanelWidth(resolvedWidth);
  }, [resolvedWidth]);

  const onResizeStart = (event: ResizeHandleMouseEvent) => {
    event.preventDefault();
    dragStartWidth.current = panelWidth;
    dragStartClientX.current = event.clientX;
  };

  const onResizeMove = (event: ResizeHandleMouseEvent) => {
    event.preventDefault();

    if (dragStartWidth.current == null) {
      return;
    }

    const nextPanelWidth = dragNodeEditorWidth({
      startWidth: dragStartWidth.current,
      startClientX: dragStartClientX.current,
      currentClientX: event.clientX,
      viewportWidth: viewportWidthRef.current,
    });

    currentPanelWidthRef.current = nextPanelWidth;
    setPanelWidth(nextPanelWidth);
  };

  const onResizeEnd = (event: ResizeHandleMouseEvent) => {
    event.preventDefault();

    const dragStart = dragStartWidth.current;
    const finalPanelWidth =
      dragStart == null
        ? currentPanelWidthRef.current
        : dragNodeEditorWidth({
            startWidth: dragStart,
            startClientX: dragStartClientX.current,
            currentClientX: event.clientX,
            viewportWidth: viewportWidthRef.current,
          });

    currentPanelWidthRef.current = finalPanelWidth;
    setPanelWidth(finalPanelWidth);
    dragStartWidth.current = undefined;

    if (persistedWidth === finalPanelWidth) {
      return;
    }

    setPersistedWidth(finalPanelWidth);
  };

  return {
    panelWidth,
    resizeHandleProps: {
      onResizeStart,
      onResizeMove,
      onResizeEnd,
    },
  };
}
