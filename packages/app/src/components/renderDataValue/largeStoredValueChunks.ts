import {
  FULLSCREEN_CHUNK_PREVIEW_MAX_CHARS,
  FULLSCREEN_CHUNK_PREVIEW_MAX_LINES,
} from '../../utils/outputStorageLimits.js';

export type LargeStoredValueChunk = {
  text: string;
  startOffset: number;
  endOffset: number;
};

export function buildLargeStoredValueChunks(
  text: string,
  options: {
    maxChars?: number;
    maxLines?: number;
  } = {},
): LargeStoredValueChunk[] {
  const maxChars = options.maxChars ?? FULLSCREEN_CHUNK_PREVIEW_MAX_CHARS;
  const maxLines = options.maxLines ?? FULLSCREEN_CHUNK_PREVIEW_MAX_LINES;

  if (text.length === 0) {
    return [
      {
        text: '',
        startOffset: 0,
        endOffset: 0,
      },
    ];
  }

  const chunks: LargeStoredValueChunk[] = [];
  let currentOffset = 0;

  while (currentOffset < text.length) {
    let nextOffset = currentOffset;
    let charCount = 0;
    let lineCount = 1;

    while (nextOffset < text.length && charCount < maxChars) {
      const nextCharacter = text[nextOffset]!;

      if (nextCharacter === '\n') {
        nextOffset += 1;
        charCount += 1;

        // A trailing newline belongs to the current rendered line boundary. Consume
        // it in the current chunk so rendered line limits stay stable and offset-to-
        // chunk match mapping remains deterministic across chunk boundaries.
        if (lineCount >= maxLines) {
          break;
        }

        lineCount += 1;
        continue;
      }

      nextOffset += 1;
      charCount += 1;
    }

    if (nextOffset === currentOffset) {
      nextOffset = Math.min(text.length, currentOffset + 1);
    }

    chunks.push({
      text: text.slice(currentOffset, nextOffset),
      startOffset: currentOffset,
      endOffset: nextOffset,
    });

    currentOffset = nextOffset;
  }

  return chunks;
}

export function getLargeStoredValueChunkIndexForOffset(
  chunks: readonly LargeStoredValueChunk[],
  matchOffset: number,
): number {
  if (chunks.length === 0) {
    return 0;
  }

  if (matchOffset <= 0) {
    return 0;
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    if (matchOffset < chunk.endOffset) {
      return index;
    }
  }

  return chunks.length - 1;
}
