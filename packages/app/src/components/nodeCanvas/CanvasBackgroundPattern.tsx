import { type FC, useCallback, useEffect, useRef } from 'react';
import { type CanvasPosition } from '../../state/graphBuilder.js';
import { type CanvasBackgroundPattern as CanvasBackgroundPatternKind } from '../../state/settings.js';
import {
  getCanvasBackgroundPatternDots,
  getCanvasBackgroundPatternOpacity,
  getCanvasBackgroundPatternTileOffset,
  getCanvasBackgroundPatternTileSize,
} from './canvasBackgroundPatternModel.js';

type CanvasBackgroundPatternProps = {
  canvasPosition: CanvasPosition;
  opacity: number;
  pattern: CanvasBackgroundPatternKind;
};

const DEFAULT_PATTERN_RGB = { r: 255, g: 255, b: 255 };

type PatternTileCache = {
  key: string;
  tile: HTMLCanvasElement;
};

export const CanvasBackgroundPatternLayer: FC<CanvasBackgroundPatternProps> = ({
  canvasPosition,
  opacity,
  pattern,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const patternTileCacheRef = useRef<PatternTileCache | undefined>();
  const redrawRef = useRef<() => void>(() => {});

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;

    if (!canvas || !parent) {
      return;
    }

    const width = parent.clientWidth;
    const height = parent.clientHeight;

    if (width <= 0 || height <= 0) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasWidth = Math.ceil(width * devicePixelRatio);
    const canvasHeight = Math.ceil(height * devicePixelRatio);

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvasWidth, canvasHeight);

    const patternOpacity = getCanvasBackgroundPatternOpacity(opacity);

    if (patternOpacity <= 0) {
      return;
    }

    const { r, g, b } = parsePatternRgb(
      getComputedStyle(parent).getPropertyValue('--canvas-background-pattern-rgb'),
    );
    const tileSize = Math.max(1, Math.round(getCanvasBackgroundPatternTileSize(canvasPosition) * devicePixelRatio));
    const color = `rgba(${r}, ${g}, ${b}, ${patternOpacity})`;
    const tileCacheKey = `${pattern}:${tileSize}:${devicePixelRatio}:${color}`;
    let patternTile = patternTileCacheRef.current?.key === tileCacheKey ? patternTileCacheRef.current.tile : undefined;

    if (!patternTile) {
      patternTile = createPatternTile({
        color,
        devicePixelRatio,
        pattern,
        tileSize,
      });
      patternTileCacheRef.current = {
        key: tileCacheKey,
        tile: patternTile,
      };
    }

    const canvasPattern = context.createPattern(patternTile, 'repeat');

    if (!canvasPattern) {
      return;
    }

    const offsetX = getCanvasBackgroundPatternTileOffset(Math.round(canvasPosition.x * devicePixelRatio), tileSize);
    const offsetY = getCanvasBackgroundPatternTileOffset(Math.round(canvasPosition.y * devicePixelRatio), tileSize);

    context.save();
    context.translate(offsetX, offsetY);
    context.fillStyle = canvasPattern;
    context.fillRect(-offsetX, -offsetY, canvasWidth + tileSize, canvasHeight + tileSize);
    context.restore();
  }, [canvasPosition, opacity, pattern]);

  useEffect(() => {
    redrawRef.current = redraw;
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;

    if (!parent) {
      return;
    }

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => redrawRef.current();

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    const resizeObserver = new ResizeObserver(() => redrawRef.current());
    resizeObserver.observe(parent);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="canvas-background-pattern" aria-hidden="true" />;
};

function createPatternTile({
  color,
  devicePixelRatio,
  pattern,
  tileSize,
}: {
  color: string;
  devicePixelRatio: number;
  pattern: CanvasBackgroundPatternKind;
  tileSize: number;
}) {
  const tile = document.createElement('canvas');
  tile.width = tileSize;
  tile.height = tileSize;

  const context = tile.getContext('2d');

  if (!context) {
    return tile;
  }

  context.imageSmoothingEnabled = false;
  context.fillStyle = color;

  if (pattern === 'grid') {
    const lineSize = Math.max(1, Math.round(devicePixelRatio));
    context.fillRect(0, 0, lineSize, tileSize);
    context.fillRect(0, 0, tileSize, lineSize);
    return tile;
  }

  drawDotPatternTile(context, tileSize, devicePixelRatio, getCanvasBackgroundPatternDots(pattern));
  return tile;
}

function drawDotPatternTile(
  context: CanvasRenderingContext2D,
  tileSize: number,
  devicePixelRatio: number,
  dots: readonly { dx: number; dy: number; size: number }[],
) {
  const tileCorners = [0, tileSize];

  for (const x of tileCorners) {
    for (const y of tileCorners) {
      for (const { dx, dy, size } of dots) {
        const dotSize = Math.max(1, Math.round(size * devicePixelRatio));
        const dotX = x + Math.round(dx * devicePixelRatio);
        const dotY = y + Math.round(dy * devicePixelRatio);

        context.fillRect(dotX, dotY, dotSize, dotSize);
      }
    }
  }
}

function parsePatternRgb(value: string): typeof DEFAULT_PATTERN_RGB {
  const [r, g, b] = value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter(Number.isFinite);

  if (r == null || g == null || b == null) {
    return DEFAULT_PATTERN_RGB;
  }

  return { r, g, b };
}
