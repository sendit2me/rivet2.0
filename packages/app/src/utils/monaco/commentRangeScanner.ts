const JS_STYLE_COMMENT_TEXT_LANGUAGES = new Set([
  'markdown',
  'plain-text',
  'plaintext',
  'prompt-interpolation',
  'prompt-interpolation-markdown',
]);

export type JsStyleCommentRange = {
  start: number;
  end: number;
};

function isLineCommentStart(text: string, offset: number): boolean {
  if (offset === 0) {
    return true;
  }

  const previous = text.charAt(offset - 1);

  return previous !== ':';
}

function findLineEnd(text: string, offset: number): number {
  let end = offset;

  while (end < text.length && text[end] !== '\n' && text[end] !== '\r') {
    end += 1;
  }

  return end;
}

export function shouldHighlightJsStyleComments(language: string | undefined): boolean {
  return language != null && JS_STYLE_COMMENT_TEXT_LANGUAGES.has(language);
}

export function findJsStyleCommentRanges(text: string): JsStyleCommentRange[] {
  const ranges: JsStyleCommentRange[] = [];
  let offset = 0;

  while (offset < text.length - 1) {
    const current = text[offset];
    const next = text[offset + 1];

    if (current === '/' && next === '*') {
      const closeOffset = text.indexOf('*/', offset + 2);
      const end = closeOffset === -1 ? text.length : closeOffset + 2;
      ranges.push({ start: offset, end });
      offset = end;
      continue;
    }

    if (current === '/' && next === '/' && isLineCommentStart(text, offset)) {
      const end = findLineEnd(text, offset + 2);
      ranges.push({ start: offset, end });
      offset = end;
      continue;
    }

    offset += 1;
  }

  return ranges;
}
