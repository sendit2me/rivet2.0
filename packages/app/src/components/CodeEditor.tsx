import { useLatest } from 'ahooks';
import { type FC, type MutableRefObject, useEffect, useRef } from 'react';
import { monaco } from '../utils/monaco.js';
import { useMultilineEditorFontSize } from '../hooks/useMultilineEditorFontSize.js';
import { DEFAULT_MONACO_THEME } from './codeEditorTheme.js';

export const CodeEditor: FC<{
  text: string;
  isReadonly?: boolean;
  onChange?: (newText: string) => void;
  language?: string;
  theme?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: monaco.IKeyboardEvent) => void;
  onBlur?: () => void;
  editorRef?: MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>;
  scrollBeyondLastLine?: boolean;
  enableFolding?: boolean;
}> = ({
  text,
  isReadonly,
  onChange,
  language,
  theme,
  autoFocus,
  onKeyDown,
  onBlur,
  editorRef,
  scrollBeyondLastLine,
  enableFolding,
}) => {
  const editorContainer = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<monaco.editor.IStandaloneCodeEditor>();

  const onChangeLatest = useLatest(onChange);
  const { fontSize, handleKeyDown: handleFontSizeKeyDown } = useMultilineEditorFontSize();

  useEffect(() => {
    const container = editorContainer.current;

    if (!container) {
      return;
    }

    const editor = monaco.editor.create(
      container,
      {
        theme: theme ?? DEFAULT_MONACO_THEME,
        lineNumbers: 'on',
        glyphMargin: false,
        folding: enableFolding ?? false,
        foldingStrategy: enableFolding ? 'auto' : undefined,
        showFoldingControls: enableFolding ? 'mouseover' : undefined,
        foldingHighlight: enableFolding ? true : undefined,
        unfoldOnClickAfterEndOfLine: enableFolding ? false : undefined,
        lineNumbersMinChars: 2,
        language,
        minimap: {
          enabled: false,
        },
        fontSize,
        wordWrap: 'on',
        readOnly: isReadonly,
        value: text,
        scrollBeyondLastLine,
      },
    );

    editor.layout();

    const onResize = () => {
      editor.layout();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    editor.onDidChangeModelContent(() => {
      onChangeLatest.current?.(editor.getValue());
    });

    editor.onDidBlurEditorWidget(() => {
      onBlur?.();
    });

    editorInstance.current = editor;
    if (editorRef) {
      editorRef.current = editor;
    }

    const latestBeforeDispose = onChangeLatest.current;

    return () => {
      latestBeforeDispose?.(editor.getValue());
      editorInstance.current = undefined;
      if (editorRef) {
        editorRef.current = undefined;
      }
      resizeObserver?.disconnect();
      editor.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorInstance.current;

    if (!editor) {
      return undefined;
    }

    const dispose = editor.onKeyDown((event) => {
      if (handleFontSizeKeyDown(event.browserEvent)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      onKeyDown?.(event);
    });

    return () => {
      dispose.dispose();
    };
  }, [handleFontSizeKeyDown, onKeyDown]);

  useEffect(() => {
    if (autoFocus) {
      editorInstance.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const editor = editorInstance.current;

    if (!editor) {
      return;
    }

    editor.updateOptions({
      fontSize,
    });
    editor.layout();
  }, [fontSize]);

  return <div ref={editorContainer} className="editor-container" />;
};

export default CodeEditor;
