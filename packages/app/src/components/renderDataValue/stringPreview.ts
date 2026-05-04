import { COMPACT_PREVIEW_MAX_CHARS, COMPACT_PREVIEW_MAX_LINES } from '../../utils/outputStorageLimits.js';
import { buildTextPreviewExcerpt } from '../../utils/textPreview.js';

export function getRenderedStringText(
  value: unknown,
  options: {
    truncateLength?: number;
    isCompact?: boolean;
  },
): string {
  const { truncateLength, isCompact } = options;
  const text = typeof value === 'string' ? value : '';

  return buildTextPreviewExcerpt(text, {
    truncateLength,
    ...(isCompact
      ? {
          maxChars: COMPACT_PREVIEW_MAX_CHARS,
          maxLines: COMPACT_PREVIEW_MAX_LINES,
        }
      : {}),
  }).text;
}
