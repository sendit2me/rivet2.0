import { HelperMessage, Label } from '@atlaskit/form';
import { type CodeEditorDefinition, type ChartNode } from '@valerypopoff/rivet2-core';
import { useLatest, useDebounceFn } from 'ahooks';
import { useAtomValue } from 'jotai';
import { type FC, type MutableRefObject, useRef, useEffect, Suspense, useMemo, useState } from 'react';
import { type monaco } from '../../utils/monaco';
import { themeState } from '../../state/settings.js';
import { LazyCodeEditor } from '../LazyComponents';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage, getPostEditorHelperMessage } from './editorUtils';
import { resolveMonacoTheme } from '../codeEditorTheme.js';
import { ResizeHandle } from '../ResizeHandle.js';
import { resizeCursorStyles } from '../../utils/resizeCursors.js';
import { isValidHeight, RESIZABLE_LANGUAGES, useNodeEditorCodeViewportHeight } from './useNodeEditorCodeViewportHeight.js';
import { formatTextEditorStatsLine } from './textEditorStats.js';
import { handleCodeEditorEscape } from './codeEditorEscape.js';
import {
  lastRunDataState,
  resolvedGraphSelectionState,
  selectedProcessPageState,
} from '../../state/dataFlow.js';
import { getSelectedProcessData } from '../../state/selectors/executionSelectors.js';
import {
  getCodeNodeErrorLineHighlight,
  type CodeNodeErrorLineHighlight,
} from '../nodes/codeNodeOutputUtils.js';

function getErrorLineHighlightKey(highlight: CodeNodeErrorLineHighlight | undefined): string | undefined {
  return highlight ? `${highlight.runKey}:${highlight.line}` : undefined;
}

export const DefaultCodeEditor: FC<
  SharedEditorProps & {
    editor: CodeEditorDefinition<ChartNode>;
  }
> = ({ node, isReadonly, isDisabled, onChange, editor: editorDef, onClose }) => {
  const helperMessage = getHelperMessage(editorDef, node.data);
  const postEditorHelperMessage = getPostEditorHelperMessage(editorDef, node.data);
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

  const editorProps: CodeEditorProps = {
    value: (node.data as Record<string, unknown> | undefined)?.[editorDef.dataKey] as string | undefined,
    onChange: onEditorChange,
    isReadonly,
    isDisabled,
    autoFocus: editorDef.autoFocus,
    label: editorDef.label,
    name: editorDef.dataKey,
    helperMessage,
    postEditorHelperMessage,
    onClose,
    language: editorDef.language,
    theme: editorDef.theme,
    enableFolding: editorDef.enableFolding,
    id: node.id,
    nodeType: node.type,
    defaultHeight: editorDef.height,
    showTextStats: 'showTextStats' in editorDef && editorDef.showTextStats === true,
  };

  if (node.type === 'code' && editorDef.dataKey === 'code') {
    return <CodeEditorWithCodeNodeErrorHighlight node={node} {...editorProps} />;
  }

  return <CodeEditor {...editorProps} />;
};

const CodeEditorWithCodeNodeErrorHighlight: FC<CodeEditorProps & { node: ChartNode }> = ({ node, ...editorProps }) => {
  const runData = useAtomValue(lastRunDataState(node.id));
  const graphSelectionOptions = useAtomValue(resolvedGraphSelectionState);
  const selectedPage = useAtomValue(selectedProcessPageState(node.id));
  const selectedRun = useMemo(
    () => getSelectedProcessData(runData, selectedPage, graphSelectionOptions),
    [graphSelectionOptions, runData, selectedPage],
  );
  const errorLineHighlight = useMemo(
    () => getCodeNodeErrorLineHighlight(selectedRun),
    [selectedRun],
  );

  return <CodeEditor {...editorProps} errorLineHighlight={errorLineHighlight} />;
};

type CodeEditorProps = {
  value: string | undefined;
  onChange: (value: string) => void;
  isDisabled: boolean;
  isReadonly: boolean;
  autoFocus?: boolean;
  label: string;
  name?: string;
  helperMessage?: string;
  postEditorHelperMessage?: string;
  onClose?: () => void;
  theme?: string;
  language?: string;
  enableFolding?: boolean;
  id?: string;
  nodeType?: string;
  defaultHeight?: number;
  showTextStats?: boolean;
  errorLineHighlight?: CodeNodeErrorLineHighlight;
};

export const CodeEditor: FC<CodeEditorProps> = ({
  value,
  onChange,
  isReadonly,
  isDisabled,
  autoFocus,
  label,
  name,
  helperMessage,
  postEditorHelperMessage,
  onClose,
  theme,
  language,
  enableFolding,
  id,
  nodeType,
  defaultHeight,
  showTextStats = false,
  errorLineHighlight,
}) => {
  const editorInstance = useRef<monaco.editor.IStandaloneCodeEditor>();
  const [displayValue, setDisplayValue] = useState(value ?? '');
  const [dismissedErrorLineHighlightKey, setDismissedErrorLineHighlightKey] = useState<string>();

  const onChangeLatest = useLatest(onChange);
  const isEditorReadOnly = isReadonly || isDisabled;
  const appTheme = useAtomValue(themeState);
  const resolvedTheme = resolveMonacoTheme(theme, appTheme);
  const isResizable = language != null && RESIZABLE_LANGUAGES.has(language);
  const editorIdentityKey = name?.trim() || label;
  const editorMountKey = `${id ?? 'node-editor'}::${editorIdentityKey}::${language ?? 'language'}::${resolvedTheme ?? 'theme'}::${
    enableFolding ? 'folding-on' : 'folding-off'
  }`;
  const errorLineHighlightKey = getErrorLineHighlightKey(errorLineHighlight);
  const activeErrorLineHighlight =
    errorLineHighlightKey &&
    dismissedErrorLineHighlightKey !== errorLineHighlightKey &&
    displayValue === errorLineHighlight?.source
      ? errorLineHighlight
      : undefined;

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

    if (errorLineHighlightKey && newText !== errorLineHighlight?.source) {
      setDismissedErrorLineHighlightKey(errorLineHighlightKey);
    }

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
    <div className="editor-wrapper-wrapper">
      {label && <Label htmlFor="">{label}</Label>}
      {helperMessage && (
        <div className="node-editor-code-helper">
          <HelperMessage>{helperMessage}</HelperMessage>
        </div>
      )}
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
          errorLineHighlight={activeErrorLineHighlight}
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
          errorLineHighlight={activeErrorLineHighlight}
        />
      )}
      {postEditorHelperMessage && (
        <div className="node-editor-code-helper node-editor-code-helper-after">
          <HelperMessage>{postEditorHelperMessage}</HelperMessage>
        </div>
      )}
      {showTextStats && <div className="editor-status-line">{formatTextEditorStatsLine(displayValue)}</div>}
    </div>
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
  errorLineHighlight?: CodeNodeErrorLineHighlight;
};

const CodeEditorLoadingFallback: FC = () => (
  <div className="editor-container code-editor-loading-placeholder" aria-busy="true">
    Loading editor...
  </div>
);

const SuspendedCodeEditor: FC<ViewportProps> = ({
  editorMountKey,
  editorInstance,
  text,
  onChange,
  theme,
  language,
  isReadonly,
  onKeyDown,
  autoFocus,
  enableFolding,
  errorLineHighlight,
}) => (
  <Suspense fallback={<CodeEditorLoadingFallback />}>
    <LazyCodeEditor
      key={editorMountKey}
      editorRef={editorInstance}
      text={text}
      onChange={onChange}
      theme={theme}
      language={language}
      isReadonly={isReadonly}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      enableFolding={enableFolding}
      errorLineHighlight={errorLineHighlight}
    />
  </Suspense>
);

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
        <SuspendedCodeEditor {...editorProps} />
      </div>
      <ResizeHandle
        className="node-editor-code-resize-handle"
        dragCursor={resizeCursorStyles.vertical}
        {...resizeHandleProps}
      />
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
      <SuspendedCodeEditor {...editorProps} />
    </div>
  );
};
