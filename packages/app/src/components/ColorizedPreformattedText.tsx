import { type FC, useLayoutEffect, useRef } from 'react';
import { monaco } from '../utils/monaco';
import { useAtomValue } from 'jotai';
import { themeState } from '../state/settings';
import { resolveCodeEditorTheme } from './codeEditorOptions.js';

export const ColorizedPreformattedText: FC<{ text: string; language: string; theme?: string }> = ({
  text,
  language,
  theme,
}) => {
  const bodyRef = useRef<HTMLPreElement>(null);
  const appTheme = useAtomValue(themeState);
  const resolvedTheme = resolveCodeEditorTheme(theme, appTheme);

  useLayoutEffect(() => {
    monaco.editor.colorizeElement(bodyRef.current!, {
      theme: resolvedTheme ?? 'vs-dark',
    });
  }, [text, resolvedTheme]);

  return (
    <pre ref={bodyRef} data-lang={language}>
      {text}
    </pre>
  );
};

export default ColorizedPreformattedText;
