import { HelperMessage, Label } from '@atlaskit/form';
import Toggle from '@atlaskit/toggle';
import { type ToggleEditorDefinition, type ChartNode } from '@ironclad/rivet-core';
import { type FC } from 'react';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage } from './editorUtils';

export const DefaultToggleEditor: FC<
  SharedEditorProps & {
    editor: ToggleEditorDefinition<ChartNode>;
  }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const data = node.data as Record<string, unknown>;
  const helperMessage = getHelperMessage(editor, node.data);
  return (
    <ToggleEditor
      value={data[editor.dataKey] as boolean | undefined}
      isReadonly={isReadonly}
      isDisabled={isDisabled}
      onChange={(newValue) => {
        onChange({
          ...node,
          data: {
            ...data,
            [editor.dataKey]: newValue,
          },
        });
      }}
      label={editor.label}
      name={editor.dataKey}
      helperMessage={helperMessage}
    />
  );
};

export const ToggleEditor: FC<{
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
  isDisabled: boolean;
  isReadonly: boolean;
  label: string;
  name?: string;
  helperMessage?: string;
}> = ({ value, onChange, isReadonly, isDisabled, label, name, helperMessage }) => {
  const toggleId = name ?? label;

  return (
    <div className="toggle-editor-field">
      <div className="toggle-editor-control-row">
        <div className="toggle-editor-label">
          <Label htmlFor={toggleId}>{label}</Label>
        </div>
        <Toggle
          id={toggleId}
          isChecked={value}
          isDisabled={isReadonly || isDisabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
      {helperMessage && (
        <div className="toggle-editor-helper">
          <HelperMessage>{helperMessage}</HelperMessage>
        </div>
      )}
    </div>
  );
};
