export type TextPreviewOptions = {
  truncateLength?: number;
  maxChars?: number;
  maxLines?: number;
};

export type TextPreviewResult = {
  text: string;
  truncated: boolean;
};

export function buildTextPreviewExcerpt(text: string, options: TextPreviewOptions): TextPreviewResult {
  const { truncateLength, maxChars, maxLines } = options;

  let previewText = text;
  let truncated = false;

  if (truncateLength != null && previewText.length > truncateLength) {
    previewText = previewText.slice(0, truncateLength);
    truncated = true;
  }

  if (maxLines != null) {
    const lines = previewText.split('\n');
    if (lines.length > maxLines) {
      previewText = lines.slice(0, maxLines).join('\n');
      truncated = true;
    }
  }

  if (maxChars != null && previewText.length > maxChars) {
    previewText = previewText.slice(0, maxChars);
    truncated = true;
  }

  if (truncated) {
    previewText =
      previewText.length === 0 ? '...' : previewText.endsWith('\n') ? `${previewText}...` : `${previewText}\n...`;
  }

  return {
    text: previewText,
    truncated,
  };
}
