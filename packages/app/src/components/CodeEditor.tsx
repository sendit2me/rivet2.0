import { useLatest } from 'ahooks';
import { type FC, type MutableRefObject, useEffect, useRef } from 'react';
import { monaco } from '../utils/monaco.js';
import { useMultilineEditorFontSize } from '../hooks/useMultilineEditorFontSize.js';
import { DEFAULT_MONACO_THEME } from './codeEditorTheme.js';
import { useIsNodeEditorResizing } from './nodeEditor/NodeEditorResizeContext.js';
import { installEditorInterpolationSupport } from '../utils/monaco/interpolationEditorSupport.js';
import { type EditorInterpolationSyntax } from '../utils/monaco/interpolationDiagnostics.js';
import { installJsStyleCommentHighlighting } from '../utils/monaco/commentHighlighting.js';
import { shouldHighlightJsStyleComments } from '../utils/monaco/commentRangeScanner.js';

export const CodeEditor: FC<{
  text: string;
  isReadonly?: boolean;
  onChange?: (newText: string) => void;
  language?: string;
  interpolationSyntax?: EditorInterpolationSyntax;
  theme?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: monaco.IKeyboardEvent) => void;
  onBlur?: () => void;
  editorRef?: MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>;
  scrollBeyondLastLine?: boolean;
  enableFolding?: boolean;
  errorLineHighlight?: {
    line: number;
    source: string;
  };
}> = ({
  text,
  isReadonly,
  onChange,
  language,
  interpolationSyntax,
  theme,
  autoFocus,
  onKeyDown,
  onBlur,
  editorRef,
  scrollBeyondLastLine,
  enableFolding,
  errorLineHighlight,
}) => {
  const editorContainer = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<monaco.editor.IStandaloneCodeEditor>();
  const errorLineDecorationIds = useRef<string[]>([]);
  const pendingResizeLayoutRef = useRef(false);

  const onChangeLatest = useLatest(onChange);
  const { fontSize, handleKeyDown: handleFontSizeKeyDown } = useMultilineEditorFontSize();
  const isNodeEditorResizing = useIsNodeEditorResizing();
  const isNodeEditorResizingRef = useRef(isNodeEditorResizing);

  isNodeEditorResizingRef.current = isNodeEditorResizing;

  useEffect(() => {
    const container = editorContainer.current;

    if (!container) {
      return;
    }

    const editor = monaco.editor.create(container, {
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
      scrollbar: {
        alwaysConsumeMouseWheel: false,
      },
    });

    editor.layout();
    const interpolationSupport =
      interpolationSyntax != null ? installEditorInterpolationSupport(editor, interpolationSyntax) : undefined;
    const commentHighlightingSupport = shouldHighlightJsStyleComments(language)
      ? installJsStyleCommentHighlighting(editor)
      : undefined;

    const onResize = () => {
      // Resizing the node settings panel can emit a dense stream of ResizeObserver
      // events. Defer Monaco relayout until the drag ends to keep panel resize smooth.
      if (isNodeEditorResizingRef.current) {
        pendingResizeLayoutRef.current = true;
        return;
      }

      pendingResizeLayoutRef.current = false;
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
      interpolationSupport?.dispose();
      commentHighlightingSupport?.dispose();
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

  useEffect(() => {
    const editor = editorInstance.current;
    const model = editor?.getModel();

    if (!editor || !model) {
      return;
    }

    const line =
      errorLineHighlight &&
      text === errorLineHighlight.source &&
      errorLineHighlight.line >= 1 &&
      errorLineHighlight.line <= model.getLineCount()
        ? errorLineHighlight.line
        : undefined;

    errorLineDecorationIds.current = editor.deltaDecorations(
      errorLineDecorationIds.current,
      line
        ? [
            {
              range: new monaco.Range(line, 1, line, 1),
              options: {
                className: 'code-node-runtime-error-line',
                isWholeLine: true,
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
              },
            },
          ]
        : [],
    );
  }, [errorLineHighlight, text]);

  useEffect(() => {
    if (isNodeEditorResizing) {
      return;
    }

    if (!pendingResizeLayoutRef.current) {
      return;
    }

    pendingResizeLayoutRef.current = false;
    editorInstance.current?.layout();
  }, [isNodeEditorResizing]);

  return <div ref={editorContainer} className="editor-container" />;
};

export default CodeEditor;
