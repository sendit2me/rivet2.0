import { type FC, useLayoutEffect, useRef } from 'react';
import { monaco } from '../utils/monaco';
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
  const appTheme = useAtomValue(themeState);
  const resolvedTheme = resolveMonacoDisplayTheme(theme, appTheme);
  const foreground = resolveMonacoForeground(theme, appTheme);

  useLayoutEffect(() => {
    let cancelled = false;
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    body.textContent = text;
    body.dataset.lang = language;

    void monaco.editor
      .colorizeElement(body, {
        theme: resolvedTheme,
      })
      .then(() => {
        if (wrapWords && !cancelled) {
          normalizeColorizedWordWrapSpaces(body);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [text, language, resolvedTheme, wrapWords]);

  return (
    <pre
      ref={bodyRef}
      className={className}
      data-lang={language}
      style={foreground ? { color: foreground } : undefined}
    >
      {text}
    </pre>
  );
};

export default ColorizedPreformattedText;
