import { COMPACT_PREVIEW_MAX_CHARS, COMPACT_PREVIEW_MAX_LINES } from '../../utils/outputStorageLimits.js';

export function getRenderedStringText(
  value: string,
  options: {
    truncateLength?: number;
    isCompact?: boolean;
  },
): string {
  const { truncateLength, isCompact } = options;

  let rendered = truncateLength != null && value.length > truncateLength ? `${value.slice(0, truncateLength)}...` : value;

  if (isCompact) {
    const compactByLines = rendered.split('\n').slice(0, COMPACT_PREVIEW_MAX_LINES).join('\n');
    rendered =
      compactByLines.length > COMPACT_PREVIEW_MAX_CHARS
        ? `${compactByLines.slice(0, COMPACT_PREVIEW_MAX_CHARS)}...`
        : compactByLines;
  }

  return rendered;
}
