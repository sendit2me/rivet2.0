import { useLatest } from 'ahooks';
import { type FC, type MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from 'react';

type ResizeHandleMouseEvent = globalThis.MouseEvent;

interface ResizeHandleProps {
  className?: string;
  dragCursor?: string;
  onResizeStart?: (event: ResizeHandleMouseEvent) => void;
  onResizeMove?: (event: ResizeHandleMouseEvent) => void;
  onResizeEnd?: (event: ResizeHandleMouseEvent) => void;
}

export const ResizeHandle: FC<ResizeHandleProps> = ({
  className,
  dragCursor,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const onResizeMoveLatest = useLatest(onResizeMove);
  const onResizeStartLatest = useLatest(onResizeStart);
  const onResizeEndLatest = useLatest(onResizeEnd);

  const onResizeMoveRef = useRef<(event: ResizeHandleMouseEvent) => void>(() => {});
  const handleMouseUpRef = useRef<(event: ResizeHandleMouseEvent) => void>(() => {});
  const previousBodyStylesRef = useRef<{ cursor: string; userSelect: string } | null>(null);

  const applyBodyResizeCursor = () => {
    if (!dragCursor || typeof document === 'undefined') {
      return;
    }

    previousBodyStylesRef.current ??= {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = dragCursor;
    document.body.style.userSelect = 'none';
  };

  const restoreBodyResizeCursor = useCallback(() => {
    if (typeof document === 'undefined' || !previousBodyStylesRef.current) {
      return;
    }

    document.body.style.cursor = previousBodyStylesRef.current.cursor;
    document.body.style.userSelect = previousBodyStylesRef.current.userSelect;
    previousBodyStylesRef.current = null;
  }, []);

  const removeWindowListeners = useCallback((options: { resetResizeState?: boolean } = {}) => {
    window.removeEventListener('mousemove', onResizeMoveRef.current, {
      capture: true,
    });
    window.removeEventListener('mouseup', handleMouseUpRef.current, { capture: true });
    restoreBodyResizeCursor();
    if (options.resetResizeState) {
      setIsResizing(false);
    }
  }, [restoreBodyResizeCursor]);

  useEffect(() => {
    return () => {
      removeWindowListeners();
    };
  }, [removeWindowListeners]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsResizing(true);
    applyBodyResizeCursor();
    try {
      onResizeStartLatest.current?.(event.nativeEvent);
    } catch (error) {
      removeWindowListeners({ resetResizeState: true });
      throw error;
    }

    onResizeMoveRef.current = (e) => onResizeMoveLatest.current?.(e);
    handleMouseUpRef.current = (e) => handleMouseUp(e);

    window.addEventListener('mousemove', onResizeMoveRef.current, {
      passive: false,
      capture: true,
    });
    window.addEventListener('mouseup', handleMouseUpRef.current, {
      capture: true,
    });
  };

  const handleMouseUp = (event: ResizeHandleMouseEvent) => {
    event.stopPropagation();
    try {
      onResizeEndLatest.current?.(event);
    } finally {
      removeWindowListeners({ resetResizeState: true });
    }
  };

  return (
    <div
      className={['resize-handle', className, isResizing && 'is-resizing'].filter(Boolean).join(' ')}
      onMouseDown={handleMouseDown}
    ></div>
  );
};
