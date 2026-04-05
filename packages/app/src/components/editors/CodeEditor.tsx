import { HelperMessage, Label } from '@atlaskit/form';
import { type CodeEditorDefinition, type ChartNode } from '@ironclad/rivet-core';
import { useLatest, useDebounceFn } from 'ahooks';
import { useAtomValue } from 'jotai';
import { type FC, useRef, useEffect, Suspense } from 'react';
import { type monaco } from '../../utils/monaco';
import { themeState } from '../../state/settings.js';
import { LazyCodeEditor } from '../LazyComponents';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage } from './editorUtils';
import { getNodeEditorCodeEditorMountKey, resolveCodeEditorTheme } from '../codeEditorOptions.js';

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
}) => {
  const editorInstance = useRef<monaco.editor.IStandaloneCodeEditor>();

  const onChangeLatest = useLatest(onChange);
  const isEditorReadOnly = isReadonly || isDisabled;
  const appTheme = useAtomValue(themeState);
  const resolvedTheme = resolveCodeEditorTheme(theme, appTheme);
  const editorMountKey = getNodeEditorCodeEditorMountKey({
    nodeId: id,
    fieldIdentity: name ?? label,
    language,
    theme: resolvedTheme,
    enableFolding,
  });

  useEffect(() => {
    if (editorInstance.current) {
      const currentValue = value;
      const textChanged = editorInstance.current.getValue() !== currentValue;
      const hasTextFocus = editorInstance.current.hasTextFocus();

      // Only set the text explicitly if we're not editing it and have a cursor position.
      if (textChanged && !hasTextFocus) {
        editorInstance.current.setValue(currentValue ?? '');
      }

      editorInstance.current.updateOptions({
        readOnly: isEditorReadOnly,
      });
    }
  }, [value, isEditorReadOnly]);

  const handleKeyDown = (e: monaco.IKeyboardEvent) => {
    if (e.keyCode === 9 /* Escape */) {
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    }
  };

  return (
    <Suspense fallback={<div />}>
      <div className="editor-wrapper-wrapper">
        <Label htmlFor="">{label}</Label>
        {helperMessage && <HelperMessage>{helperMessage}</HelperMessage>}
        <div className="editor-wrapper">
          <LazyCodeEditor
            key={editorMountKey}
            editorRef={editorInstance}
            text={value ?? ''}
            onChange={(newValue) => {
              onChangeLatest.current?.(newValue);
            }}
            theme={resolvedTheme}
            language={language}
            isReadonly={isEditorReadOnly}
            onKeyDown={handleKeyDown}
            autoFocus={autoFocus}
            enableFolding={enableFolding}
          />
        </div>
      </div>
    </Suspense>
  );
};
