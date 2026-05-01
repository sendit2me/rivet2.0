import type { BoxNodeResizeDirection } from './nodeResize.js';

export const resizeCursorStyles = {
  horizontal: 'var(--resize-edge-horizontal-cursor, ew-resize)',
  vertical: 'var(--resize-edge-vertical-cursor, ns-resize)',
  diagonalDown: 'var(--resize-edge-diagonal-down-cursor, nwse-resize)',
  diagonalUp: 'var(--resize-edge-diagonal-up-cursor, nesw-resize)',
} as const;

export function getBoxResizeCursor(direction: BoxNodeResizeDirection): string {
  switch (direction) {
    case 'left':
    case 'right':
      return resizeCursorStyles.horizontal;
    case 'top':
    case 'bottom':
      return resizeCursorStyles.vertical;
    case 'top-left':
    case 'bottom-right':
      return resizeCursorStyles.diagonalDown;
    case 'top-right':
    case 'bottom-left':
      return resizeCursorStyles.diagonalUp;
  }
}
