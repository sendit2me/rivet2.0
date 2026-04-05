import { useLatest } from 'ahooks';
import { type FC, type MutableRefObject, useEffect, useRef } from 'react';
import { monaco } from '../utils/monaco.js';
import { buildCodeEditorCreateOptions } from './codeEditorOptions.js';

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

  useEffect(() => {
    if (!editorContainer.current) {
      return;
    }

    const editor = monaco.editor.create(
      editorContainer.current,
      buildCodeEditorCreateOptions({
        theme,
        language,
        text,
        readOnly: isReadonly,
        scrollBeyondLastLine,
        enableFolding,
      }),
    );

    const onResize = () => {
      editor.layout();
    };

    editor.layout();

    window.addEventListener('resize', onResize);

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
      editor.dispose();
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (onKeyDown) {
      const dispose = editorInstance.current?.onKeyDown(onKeyDown);
      return () => {
        dispose?.dispose();
      };
    }
  }, [onKeyDown]);

  useEffect(() => {
    if (autoFocus) {
      editorInstance.current?.focus();
    }
  }, [autoFocus]);

  return <div ref={editorContainer} className="editor-container" />;
};

export default CodeEditor;
