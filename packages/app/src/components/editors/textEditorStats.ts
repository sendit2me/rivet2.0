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
