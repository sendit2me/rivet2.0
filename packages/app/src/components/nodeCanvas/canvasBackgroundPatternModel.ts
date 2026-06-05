import { clampCanvasBackgroundPatternOpacity, type CanvasBackgroundPattern } from '../../state/settings.js';
import { type CanvasPosition } from '../../state/graphBuilder.js';

export const CANVAS_BACKGROUND_PATTERN_SPACING = 20;

export type CanvasBackgroundPatternDot = {
  dx: number;
  dy: number;
  size: number;
};

const DOT_PATTERN_DOTS: readonly CanvasBackgroundPatternDot[] = [{ dx: -1, dy: -1, size: 2 }];

const CROSS_PATTERN_DOTS: readonly CanvasBackgroundPatternDot[] = [
  { dx: 0, dy: 0, size: 1 },
  { dx: 1, dy: 0, size: 1 },
  { dx: 2, dy: 0, size: 1 },
  { dx: 3, dy: 0, size: 1 },
  { dx: -1, dy: 0, size: 1 },
  { dx: -2, dy: 0, size: 1 },
  { dx: -3, dy: 0, size: 1 },
  { dx: 0, dy: 1, size: 1 },
  { dx: 0, dy: 2, size: 1 },
  { dx: 0, dy: 3, size: 1 },
  { dx: 0, dy: -1, size: 1 },
  { dx: 0, dy: -2, size: 1 },
  { dx: 0, dy: -3, size: 1 },
];

export function getCanvasBackgroundPatternOpacity(opacity: unknown): number {
  return clampCanvasBackgroundPatternOpacity(opacity);
}

export function getCanvasBackgroundPatternTileSize(canvasPosition: Pick<CanvasPosition, 'zoom'>): number {
  return Math.max(1, CANVAS_BACKGROUND_PATTERN_SPACING * canvasPosition.zoom);
}

export function getCanvasBackgroundPatternScreenOrigin(origin: number, zoom: number): number {
  if (!Number.isFinite(origin) || !Number.isFinite(zoom)) {
    return 0;
  }

  return origin * zoom;
}

export function getCanvasBackgroundPatternTileOffset(origin: number, tileSize: number): number {
  if (!Number.isFinite(origin) || !Number.isFinite(tileSize) || tileSize <= 0) {
    return 0;
  }

  return positiveModulo(origin, tileSize);
}

export function getCanvasBackgroundPatternDots(
  pattern: CanvasBackgroundPattern,
): readonly CanvasBackgroundPatternDot[] {
  if (pattern === 'dots') {
    return DOT_PATTERN_DOTS;
  }

  if (pattern === 'crosses') {
    return CROSS_PATTERN_DOTS;
  }

  return [];
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
