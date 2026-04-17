import type { OutputRenderMode } from '../RenderDataValue.js';

export function resolveNodeOutputPreviewMode(isOutputExpanded: boolean): {
  isCompact: boolean;
  renderMode: OutputRenderMode;
} {
  return isOutputExpanded
    ? {
        isCompact: false,
        renderMode: 'full',
      }
    : {
        isCompact: true,
        renderMode: 'compact',
      };
}
