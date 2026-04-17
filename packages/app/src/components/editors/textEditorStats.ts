export type TextEditorStats = {
  wordCount: number;
  characterCount: number;
};

export function getTextEditorStats(text: string): TextEditorStats {
  const words = text.trim().match(/\S+/g);

  return {
    wordCount: words?.length ?? 0,
    characterCount: text.length,
  };
}

export function formatTextEditorStatsLine(text: string): string {
  const { wordCount, characterCount } = getTextEditorStats(text);

  return `Words: ${wordCount.toLocaleString()}  Characters: ${characterCount.toLocaleString()}`;
}
