import type { OutputRenderMode } from '../RenderDataValue.js';

export function resolveNodeOutputPreviewMode(options: {
  isOutputExpanded: boolean;
  isHovered?: boolean;
}): {
  isCompact: boolean;
  renderMode: OutputRenderMode;
} {
  const { isOutputExpanded, isHovered = false } = options;

  if (isOutputExpanded) {
    return {
      isCompact: false,
      renderMode: 'full',
    };
  }

  if (isHovered) {
    return {
      isCompact: false,
      renderMode: 'expanded-preview',
    };
  }

  return {
    isCompact: true,
    renderMode: 'compact',
  };
}
