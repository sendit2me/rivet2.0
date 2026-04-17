export type HorizontalNodeResizeDirection = 'left' | 'right';

export type HorizontalNodeResizeBounds = {
  x: number;
  width: number;
};

export const DEFAULT_NODE_WIDTH = 300;
export const MIN_NODE_WIDTH = 160;

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
