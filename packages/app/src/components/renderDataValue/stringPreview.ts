import { COMPACT_PREVIEW_MAX_CHARS, COMPACT_PREVIEW_MAX_LINES } from '../../utils/outputStorageLimits.js';
import { buildTextPreviewExcerpt } from '../../utils/textPreview.js';

export function getRenderedStringText(
  value: string,
  options: {
    truncateLength?: number;
    isCompact?: boolean;
  },
): string {
  const { truncateLength, isCompact } = options;

  return buildTextPreviewExcerpt(value, {
    truncateLength,
    ...(isCompact
      ? {
          maxChars: COMPACT_PREVIEW_MAX_CHARS,
          maxLines: COMPACT_PREVIEW_MAX_LINES,
        }
      : {}),
  }).text;
}
