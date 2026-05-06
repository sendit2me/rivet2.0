import type { ChartNode } from '@valerypopoff/rivet2-core';

export type NodeColor = NonNullable<ChartNode['visualData']['color']>;

export const DEFAULT_NODE_HEADER_COLOR = 'var(--grey-darkish)';
export const HEADER_ONLY_NODE_BORDER_COLOR = 'transparent';

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

  return color?.bg || DEFAULT_NODE_HEADER_COLOR;
}

export function getNodeBorderReferenceColor(color: NodeColor | undefined): string {
  const borderColor = color?.border;

  return borderColor && borderColor !== HEADER_ONLY_NODE_BORDER_COLOR && !isLegacyBorderOnlyNodeColor(color)
    ? borderColor
    : getNodeHeaderColor(color);
}

function isLegacyBorderOnlyNodeColor(color: NodeColor | undefined): boolean {
  return (
    !!color?.border &&
    color.bg === DEFAULT_NODE_HEADER_COLOR &&
    color.border !== DEFAULT_NODE_HEADER_COLOR &&
    color.border !== HEADER_ONLY_NODE_BORDER_COLOR
  );
}
