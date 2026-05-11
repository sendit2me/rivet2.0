import { type FC, useLayoutEffect, useRef } from 'react';
import { ensureMonacoLanguage, monaco } from '../utils/monaco';
import { useAtomValue } from 'jotai';
import { themeState } from '../state/settings';
import { resolveMonacoDisplayTheme, resolveMonacoForeground } from './codeEditorTheme.js';

function normalizeColorizedWordWrapSpaces(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    node.textContent = node.textContent?.replace(/\u00A0/g, ' ') ?? null;
  }
}

export const ColorizedPreformattedText: FC<{
  text: string;
  language: string;
  theme?: string;
  className?: string;
  wrapWords?: boolean;
}> = ({ text, language, theme, className, wrapWords = false }) => {
  const bodyRef = useRef<HTMLPreElement>(null);
  const colorizeRequestRef = useRef(0);
  const appTheme = useAtomValue(themeState);
  const resolvedTheme = resolveMonacoDisplayTheme(theme, appTheme);
  const foreground = resolveMonacoForeground(theme, appTheme);
  const preClassName = className ? `${className} ${resolvedTheme}` : resolvedTheme;

  useLayoutEffect(() => {
    let cancelled = false;
    const colorizeRequest = colorizeRequestRef.current + 1;
    const body = bodyRef.current;
    colorizeRequestRef.current = colorizeRequest;

    if (!body) {
      return;
    }

    body.textContent = text;
    body.dataset.lang = language;
    monaco.editor.setTheme(resolvedTheme);

    void ensureMonacoLanguage(language)
      .then(() => monaco.editor.colorize(text, language, {}))
      .then((html) => {
        if (cancelled || colorizeRequestRef.current !== colorizeRequest || bodyRef.current !== body) {
          return;
        }

        body.innerHTML = html;

        if (wrapWords) {
          normalizeColorizedWordWrapSpaces(body);
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV && !cancelled && colorizeRequestRef.current === colorizeRequest) {
          console.warn('Failed to colorize Monaco preview text', {
            language,
            error,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [text, language, resolvedTheme, wrapWords]);

  return (
    <pre
      ref={bodyRef}
      className={preClassName}
      data-lang={language}
      style={foreground ? { color: foreground } : undefined}
    >
      {text}
    </pre>
  );
};

export default ColorizedPreformattedText;
