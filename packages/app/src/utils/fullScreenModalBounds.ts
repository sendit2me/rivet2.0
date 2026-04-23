export type HorizontalModalBounds = {
  leftPercent: number;
  rightPercent: number;
};

export type HorizontalModalResizeEdge = 'left' | 'right';

export const DEFAULT_HORIZONTAL_MODAL_BOUNDS: HorizontalModalBounds = {
  leftPercent: 5,
  rightPercent: 5,
};

const MIN_MODAL_WIDTH_PX = 360;
const MAX_PERCENT = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function readFinitePercent(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getMinWidthPercent(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return 0;
  }

  return Math.min(MAX_PERCENT, (MIN_MODAL_WIDTH_PX / viewportWidth) * MAX_PERCENT);
}

export function normalizeHorizontalModalBounds(
  bounds: Partial<HorizontalModalBounds> | null | undefined,
  viewportWidth: number,
): HorizontalModalBounds {
  const minWidthPercent = getMinWidthPercent(viewportWidth);
  const maxCombinedMargins = MAX_PERCENT - minWidthPercent;
  const storedBounds = bounds && typeof bounds === 'object' ? bounds : {};

  let leftPercent = readFinitePercent(storedBounds.leftPercent, DEFAULT_HORIZONTAL_MODAL_BOUNDS.leftPercent);
  let rightPercent = readFinitePercent(storedBounds.rightPercent, DEFAULT_HORIZONTAL_MODAL_BOUNDS.rightPercent);

  leftPercent = clamp(leftPercent, 0, maxCombinedMargins);
  rightPercent = clamp(rightPercent, 0, maxCombinedMargins);

  const combinedMargins = leftPercent + rightPercent;
  if (combinedMargins > maxCombinedMargins) {
    const overflow = combinedMargins - maxCombinedMargins;
    const total = leftPercent + rightPercent;

    if (total > 0) {
      leftPercent -= overflow * (leftPercent / total);
      rightPercent -= overflow * (rightPercent / total);
    }
  }

  return {
    leftPercent: roundPercent(leftPercent),
    rightPercent: roundPercent(rightPercent),
  };
}

export function resizeHorizontalModalBounds({
  bounds,
  clientX,
  edge,
  viewportWidth,
}: {
  bounds: Partial<HorizontalModalBounds> | null | undefined;
  clientX: number;
  edge: HorizontalModalResizeEdge;
  viewportWidth: number;
}): HorizontalModalBounds {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return normalizeHorizontalModalBounds(bounds, viewportWidth);
  }

  const normalizedBounds = normalizeHorizontalModalBounds(bounds, viewportWidth);
  const minWidthPercent = getMinWidthPercent(viewportWidth);
  const pointerPercent = (clientX / viewportWidth) * MAX_PERCENT;

  if (edge === 'left') {
    return {
      leftPercent: roundPercent(
        clamp(pointerPercent, 0, MAX_PERCENT - normalizedBounds.rightPercent - minWidthPercent),
      ),
      rightPercent: normalizedBounds.rightPercent,
    };
  }

  return {
    leftPercent: normalizedBounds.leftPercent,
    rightPercent: roundPercent(
      clamp(MAX_PERCENT - pointerPercent, 0, MAX_PERCENT - normalizedBounds.leftPercent - minWidthPercent),
    ),
  };
}
