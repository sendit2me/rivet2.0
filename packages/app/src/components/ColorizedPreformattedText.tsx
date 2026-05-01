import { type FC, useLayoutEffect, useRef } from 'react';
import { monaco } from '../utils/monaco';
import { useAtomValue } from 'jotai';
import { themeState } from '../state/settings';
import { resolveMonacoDisplayTheme, resolveMonacoForeground } from './codeEditorTheme.js';

export const ColorizedPreformattedText: FC<{ text: string; language: string; theme?: string }> = ({
  text,
  language,
  theme,
}) => {
  const bodyRef = useRef<HTMLPreElement>(null);
  const appTheme = useAtomValue(themeState);
  const resolvedTheme = resolveMonacoDisplayTheme(theme, appTheme);
  const foreground = resolveMonacoForeground(theme, appTheme);

  useLayoutEffect(() => {
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    body.textContent = text;
    body.dataset.lang = language;

    void monaco.editor.colorizeElement(body, {
      theme: resolvedTheme,
    });
  }, [text, language, resolvedTheme]);

  return (
    <pre ref={bodyRef} style={foreground ? { color: foreground } : undefined}>
      {text}
    </pre>
  );
};

export default ColorizedPreformattedText;
