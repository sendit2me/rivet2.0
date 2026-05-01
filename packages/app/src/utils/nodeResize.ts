export type HorizontalNodeResizeDirection = 'left' | 'right';

export type BoxNodeResizeDirection =
  | HorizontalNodeResizeDirection
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type HorizontalNodeResizeBounds = {
  x: number;
  width: number;
};

export type NodeResizeBounds = HorizontalNodeResizeBounds & {
  y?: number;
  height?: number;
};

export const DEFAULT_NODE_WIDTH = 300;
export const MIN_NODE_WIDTH = 160;
export const MIN_NODE_HEIGHT = 120;

export function haveHorizontalNodeResizeBoundsChanged(
  previousBounds: HorizontalNodeResizeBounds,
  nextBounds: HorizontalNodeResizeBounds,
): boolean {
  return previousBounds.x !== nextBounds.x || previousBounds.width !== nextBounds.width;
}

export function computeHorizontalNodeResizeBounds({
  direction,
  initialWidth,
  initialX,
  deltaX,
  minWidth = MIN_NODE_WIDTH,
}: {
  direction: HorizontalNodeResizeDirection;
  initialWidth: number;
  initialX: number;
  deltaX: number;
  minWidth?: number;
}): HorizontalNodeResizeBounds {
  if (direction === 'right') {
    return {
      x: initialX,
      width: Math.max(minWidth, initialWidth + deltaX),
    };
  }

  const nextWidth = Math.max(minWidth, initialWidth - deltaX);
  const preservedRightEdge = initialX + initialWidth;

  return {
    x: preservedRightEdge - nextWidth,
    width: nextWidth,
  };
}

export function haveNodeResizeBoundsChanged(previousBounds: NodeResizeBounds, nextBounds: NodeResizeBounds): boolean {
  return (
    previousBounds.x !== nextBounds.x ||
    previousBounds.y !== nextBounds.y ||
    previousBounds.width !== nextBounds.width ||
    previousBounds.height !== nextBounds.height
  );
}

export function computeBoxNodeResizeBounds({
  direction,
  initialHeight,
  initialWidth,
  initialX,
  initialY,
  deltaX,
  deltaY,
  minHeight = MIN_NODE_HEIGHT,
  minWidth = MIN_NODE_WIDTH,
}: {
  direction: BoxNodeResizeDirection;
  initialHeight: number;
  initialWidth: number;
  initialX: number;
  initialY: number;
  deltaX: number;
  deltaY: number;
  minHeight?: number;
  minWidth?: number;
}): Required<NodeResizeBounds> {
  const resizesLeft = direction === 'left' || direction.endsWith('-left');
  const resizesRight = direction === 'right' || direction.endsWith('-right');
  const resizesTop = direction === 'top' || direction.startsWith('top-');
  const resizesBottom = direction === 'bottom' || direction.startsWith('bottom-');

  const width = resizesLeft
    ? Math.max(minWidth, initialWidth - deltaX)
    : resizesRight
      ? Math.max(minWidth, initialWidth + deltaX)
      : initialWidth;

  const height = resizesTop
    ? Math.max(minHeight, initialHeight - deltaY)
    : resizesBottom
      ? Math.max(minHeight, initialHeight + deltaY)
      : initialHeight;

  return {
    x: resizesLeft ? initialX + initialWidth - width : initialX,
    y: resizesTop ? initialY + initialHeight - height : initialY,
    width,
    height,
  };
}
