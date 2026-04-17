import { useLatest } from 'ahooks';
import { type FC, type MouseEvent as ReactMouseEvent, useEffect, useRef } from 'react';

type ResizeHandleMouseEvent = globalThis.MouseEvent;

interface ResizeHandleProps {
  className?: string;
  onResizeStart?: (event: ResizeHandleMouseEvent) => void;
  onResizeMove?: (event: ResizeHandleMouseEvent) => void;
  onResizeEnd?: (event: ResizeHandleMouseEvent) => void;
}

export const ResizeHandle: FC<ResizeHandleProps> = ({ className, onResizeStart, onResizeMove, onResizeEnd }) => {
  const onResizeMoveLatest = useLatest(onResizeMove);
  const onResizeStartLatest = useLatest(onResizeStart);
  const onResizeEndLatest = useLatest(onResizeEnd);

  const onResizeMoveRef = useRef<(event: ResizeHandleMouseEvent) => void>(() => {});
  const handleMouseUpRef = useRef<(event: ResizeHandleMouseEvent) => void>(() => {});

  const removeWindowListeners = () => {
    window.removeEventListener('mousemove', onResizeMoveRef.current, {
      capture: true,
    });
    window.removeEventListener('mouseup', handleMouseUpRef.current, { capture: true });
  };

  useEffect(() => {
    return () => {
      removeWindowListeners();
    };
  }, []);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onResizeStartLatest.current?.(event.nativeEvent);

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
    onResizeEndLatest.current?.(event);
    removeWindowListeners();
  };

  return <div className={['resize-handle', className].filter(Boolean).join(' ')} onMouseDown={handleMouseDown}></div>;
};
