import type { ChartNode } from '@valerypopoff/rivet2-core';
import {
  type RgbColor,
  CONTRAST_FOREGROUND_DARK,
  CONTRAST_FOREGROUND_LIGHT,
  getContrastRatio,
  getContrastingMonochromeColor,
  parseCssColorLiteral,
} from './colorContrast.js';

export type NodeColor = NonNullable<ChartNode['visualData']['color']>;

export const DEFAULT_NODE_HEADER_COLOR = 'var(--node-color-0)';
export const HEADER_ONLY_NODE_BORDER_COLOR = 'transparent';
export const PROJECT_DEFAULT_NODE_HEADER_COLOR = 'var(--grey-darkish)';

const NODE_HEADER_COLOR_RGB_BY_TOKEN = new Map<string, RgbColor>([
  ['var(--node-color-1)', { r: 255, g: 153, b: 0 }],
  ['var(--node-color-2)', { r: 165, g: 95, b: 255 }],
  ['var(--node-color-3)', { r: 48, g: 201, b: 195 }],
  ['var(--node-color-4)', { r: 0, g: 183, b: 76 }],
  ['var(--node-color-5)', { r: 231, g: 76, b: 60 }],
  ['var(--node-color-6)', { r: 241, g: 196, b: 15 }],
  ['var(--node-color-7)', { r: 255, g: 112, b: 77 }],
  ['var(--node-color-8)', { r: 34, g: 34, b: 34 }],
  ['var(--node-color-9)', { r: 68, g: 68, b: 68 }],
]);
const NODE_HEADER_WHITE_READABLE_CONTRAST = 3.5;
const NODE_HEADER_MID_DARK_BRIGHTNESS_THRESHOLD = 145;
const NODE_HEADER_SATURATED_CHROMA_THRESHOLD = 80;

export function createHeaderOnlyNodeColor(color: string): NodeColor {
  return {
    bg: color,
    border: HEADER_ONLY_NODE_BORDER_COLOR,
  };
}

export function createBorderAndHeaderNodeColor(color: string): NodeColor {
  return {
    bg: color,
    border: color,
  };
}

export function isNodeBorderVisible(color: NodeColor | undefined): boolean {
  const borderColor = color?.border;

  return !!borderColor && borderColor !== HEADER_ONLY_NODE_BORDER_COLOR && !isLegacyBorderOnlyNodeColor(color);
}

export function getNodeHeaderColor(color: NodeColor | undefined): string {
  if (color && isLegacyBorderOnlyNodeColor(color)) {
    return color.border;
  }

  return normalizeDefaultNodeHeaderColor(color?.bg) || DEFAULT_NODE_HEADER_COLOR;
}

export function getNodeBorderReferenceColor(color: NodeColor | undefined): string {
  const borderColor = color?.border;

  return borderColor && borderColor !== HEADER_ONLY_NODE_BORDER_COLOR && !isLegacyBorderOnlyNodeColor(color)
    ? (normalizeDefaultNodeHeaderColor(borderColor) ?? DEFAULT_NODE_HEADER_COLOR)
    : getNodeHeaderColor(color);
}

export function getNodeHeaderForegroundColor(headerColor: string): string {
  const normalizedHeaderColor = normalizeDefaultNodeHeaderColor(headerColor) ?? DEFAULT_NODE_HEADER_COLOR;

  if (normalizedHeaderColor === DEFAULT_NODE_HEADER_COLOR) {
    return 'var(--node-color-0-foreground)';
  }

  const knownColor = NODE_HEADER_COLOR_RGB_BY_TOKEN.get(normalizedHeaderColor);

  if (knownColor) {
    return getReadableNodeHeaderForegroundColor(knownColor);
  }

  const parsedColor = parseCssColorLiteral(normalizedHeaderColor);

  return parsedColor ? getReadableNodeHeaderForegroundColor(parsedColor) : 'var(--foreground-bright)';
}

function getReadableNodeHeaderForegroundColor(color: RgbColor): typeof CONTRAST_FOREGROUND_DARK | typeof CONTRAST_FOREGROUND_LIGHT {
  const contrastForeground = getContrastingMonochromeColor(color);

  if (contrastForeground === CONTRAST_FOREGROUND_LIGHT) {
    return contrastForeground;
  }

  const whiteContrast = getContrastRatio({ r: 255, g: 255, b: 255 }, color);
  const perceivedBrightness = getPerceivedBrightness(color);
  const chroma = getChroma(color);

  return whiteContrast >= NODE_HEADER_WHITE_READABLE_CONTRAST &&
    perceivedBrightness < NODE_HEADER_MID_DARK_BRIGHTNESS_THRESHOLD &&
    chroma >= NODE_HEADER_SATURATED_CHROMA_THRESHOLD
    ? CONTRAST_FOREGROUND_LIGHT
    : CONTRAST_FOREGROUND_DARK;
}

function getPerceivedBrightness(color: RgbColor): number {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}

function getChroma(color: RgbColor): number {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

function isLegacyBorderOnlyNodeColor(color: NodeColor | undefined): boolean {
  return (
    !!color?.border &&
    isDefaultNodeHeaderColor(color.bg) &&
    !isDefaultNodeHeaderColor(color.border) &&
    color.border !== HEADER_ONLY_NODE_BORDER_COLOR
  );
}

function isDefaultNodeHeaderColor(color: string | undefined): boolean {
  return color === DEFAULT_NODE_HEADER_COLOR || color === PROJECT_DEFAULT_NODE_HEADER_COLOR;
}

function normalizeDefaultNodeHeaderColor(color: string | undefined): string | undefined {
  return color === PROJECT_DEFAULT_NODE_HEADER_COLOR ? DEFAULT_NODE_HEADER_COLOR : color;
}
