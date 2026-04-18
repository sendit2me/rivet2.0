import { HelperMessage, Label } from '@atlaskit/form';
import { type CodeEditorDefinition, type ChartNode } from '@ironclad/rivet-core';
import { useLatest, useDebounceFn } from 'ahooks';
import { useAtomValue } from 'jotai';
import { type FC, type MutableRefObject, useRef, useEffect, Suspense, useState } from 'react';
import { type monaco } from '../../utils/monaco';
import { themeState } from '../../state/settings.js';
import { LazyCodeEditor } from '../LazyComponents';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage } from './editorUtils';
import { resolveMonacoTheme } from '../codeEditorTheme.js';
import { ResizeHandle } from '../ResizeHandle.js';
import { isValidHeight, RESIZABLE_LANGUAGES, useNodeEditorCodeViewportHeight } from './useNodeEditorCodeViewportHeight.js';
import { formatTextEditorStatsLine } from './textEditorStats.js';
import { handleCodeEditorEscape } from './codeEditorEscape.js';

export const DefaultCodeEditor: FC<
  SharedEditorProps & {
    editor: CodeEditorDefinition<ChartNode>;
  }
> = ({ node, isReadonly, isDisabled, onChange, editor: editorDef, onClose }) => {
  const helperMessage = getHelperMessage(editorDef, node.data);
  const nodeLatest = useLatest(node);

  const debouncedOnChange = useDebounceFn<(node: ChartNode) => void>(onChange, { wait: 100 });

  const onEditorChange = (newText: string) => {
    debouncedOnChange.run({
      ...nodeLatest.current,
      data: {
        ...(nodeLatest.current?.data as Record<string, unknown> | undefined),
        [editorDef.dataKey]: newText,
      },
    });
  };

  return (
    <CodeEditor
      value={(node.data as Record<string, unknown> | undefined)?.[editorDef.dataKey] as string | undefined}
      onChange={onEditorChange}
      isReadonly={isReadonly}
      isDisabled={isDisabled}
      autoFocus={editorDef.autoFocus}
      label={editorDef.label}
      name={editorDef.dataKey}
      helperMessage={helperMessage}
      onClose={onClose}
      language={editorDef.language}
      theme={editorDef.theme}
      enableFolding={editorDef.enableFolding}
      id={node.id}
      nodeType={node.type}
      defaultHeight={editorDef.height}
      showTextStats={node.type === 'text' && editorDef.dataKey === 'text'}
    />
  );
};

export const CodeEditor: FC<{
  value: string | undefined;
  onChange: (value: string) => void;
  isDisabled: boolean;
  isReadonly: boolean;
  autoFocus?: boolean;
  label: string;
  name?: string;
  helperMessage?: string;
  onClose?: () => void;
  theme?: string;
  language?: string;
  enableFolding?: boolean;
  id?: string;
  nodeType?: string;
  defaultHeight?: number;
  showTextStats?: boolean;
}> = ({
  value,
  onChange,
  isReadonly,
  isDisabled,
  autoFocus,
  label,
  name,
  helperMessage,
  onClose,
  theme,
  language,
  enableFolding,
  id,
  nodeType,
  defaultHeight,
  showTextStats = false,
}) => {
  const editorInstance = useRef<monaco.editor.IStandaloneCodeEditor>();
  const [displayValue, setDisplayValue] = useState(value ?? '');

  const onChangeLatest = useLatest(onChange);
  const isEditorReadOnly = isReadonly || isDisabled;
  const appTheme = useAtomValue(themeState);
  const resolvedTheme = resolveMonacoTheme(theme, appTheme);
  const isResizable = language != null && RESIZABLE_LANGUAGES.has(language);
  const editorIdentityKey = name?.trim() || label;
  const editorMountKey = `${id ?? 'node-editor'}::${editorIdentityKey}::${language ?? 'language'}::${resolvedTheme ?? 'theme'}::${
    enableFolding ? 'folding-on' : 'folding-off'
  }`;

  useEffect(() => {
    if (editorInstance.current) {
      const currentValue = value;
      const textChanged = editorInstance.current.getValue() !== currentValue;
      const hasTextFocus = editorInstance.current.hasTextFocus();

      // Only set the text explicitly if we're not editing it and have a cursor position.
      if (textChanged && !hasTextFocus) {
        editorInstance.current.setValue(currentValue ?? '');
        setDisplayValue(currentValue ?? '');
      }

      editorInstance.current.updateOptions({
        readOnly: isEditorReadOnly,
      });
    } else {
      setDisplayValue(value ?? '');
    }
  }, [value, isEditorReadOnly]);

  const handleEditorChange = (newText: string) => {
    setDisplayValue(newText);
    onChangeLatest.current(newText);
  };

  const handleKeyDown = (e: monaco.IKeyboardEvent) => {
    if (e.keyCode === 9 /* Escape */) {
      const escapeResult = handleCodeEditorEscape({
        editor: editorInstance.current,
        onClose,
      });

      if (escapeResult !== 'noop') {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  return (
    <Suspense fallback={<div />}>
      <div className="editor-wrapper-wrapper">
        {label && <Label htmlFor="">{label}</Label>}
        {helperMessage && <HelperMessage>{helperMessage}</HelperMessage>}
        {isResizable ? (
          <ResizableCodeEditorViewport
            editorMountKey={editorMountKey}
            editorInstance={editorInstance}
            text={displayValue}
            onChange={handleEditorChange}
            theme={resolvedTheme}
            language={language}
            isReadonly={isEditorReadOnly}
            onKeyDown={handleKeyDown}
            autoFocus={autoFocus}
            enableFolding={enableFolding}
            editorKey={editorIdentityKey}
            nodeType={nodeType}
            defaultHeight={defaultHeight}
          />
        ) : (
          <NonResizableCodeEditorViewport
            editorMountKey={editorMountKey}
            editorInstance={editorInstance}
            text={displayValue}
            onChange={handleEditorChange}
            theme={resolvedTheme}
            language={language}
            isReadonly={isEditorReadOnly}
            onKeyDown={handleKeyDown}
            autoFocus={autoFocus}
            enableFolding={enableFolding}
            editorKey={editorIdentityKey}
            defaultHeight={defaultHeight}
          />
        )}
        {showTextStats && <div className="editor-status-line">{formatTextEditorStatsLine(displayValue)}</div>}
      </div>
    </Suspense>
  );
};

type ViewportProps = {
  editorMountKey: string;
  editorInstance: MutableRefObject<monaco.editor.IStandaloneCodeEditor | undefined>;
  text: string;
  onChange: ((value: string) => void) | undefined;
  theme: string | undefined;
  language: string | undefined;
  isReadonly: boolean;
  onKeyDown: (e: monaco.IKeyboardEvent) => void;
  autoFocus: boolean | undefined;
  enableFolding: boolean | undefined;
  editorKey: string | undefined;
};

const ResizableCodeEditorViewport: FC<
  ViewportProps & {
    nodeType: string | undefined;
    defaultHeight: number | undefined;
  }
> = ({ nodeType, defaultHeight, ...editorProps }) => {
  const { viewportHeight, resizeHandleProps } = useNodeEditorCodeViewportHeight({
    nodeType,
    editorKey: editorProps.editorKey,
    defaultHeight,
  });

  return (
    <div className="editor-viewport-shell" style={{ height: viewportHeight }}>
      <div className="editor-wrapper">
        <LazyCodeEditor
          key={editorProps.editorMountKey}
          editorRef={editorProps.editorInstance}
          text={editorProps.text}
          onChange={editorProps.onChange}
          theme={editorProps.theme}
          language={editorProps.language}
          isReadonly={editorProps.isReadonly}
          onKeyDown={editorProps.onKeyDown}
          autoFocus={editorProps.autoFocus}
          enableFolding={editorProps.enableFolding}
        />
      </div>
      <ResizeHandle className="node-editor-code-resize-handle" {...resizeHandleProps} />
    </div>
  );
};

const NonResizableCodeEditorViewport: FC<
  ViewportProps & {
    defaultHeight: number | undefined;
  }
> = ({ defaultHeight, ...editorProps }) => {
  const staticViewportStyle = isValidHeight(defaultHeight)
    ? { minHeight: Math.round(defaultHeight) }
    : undefined;

  return (
    <div className="editor-wrapper node-editor-static-code-editor" style={staticViewportStyle}>
      <LazyCodeEditor
        key={editorProps.editorMountKey}
        editorRef={editorProps.editorInstance}
        text={editorProps.text}
        onChange={editorProps.onChange}
        theme={editorProps.theme}
        language={editorProps.language}
        isReadonly={editorProps.isReadonly}
        onKeyDown={editorProps.onKeyDown}
        autoFocus={editorProps.autoFocus}
        enableFolding={editorProps.enableFolding}
      />
    </div>
  );
};
