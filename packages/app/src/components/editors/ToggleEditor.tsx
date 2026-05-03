import { type ToggleEditorDefinition, type ChartNode } from '@rivet2/rivet-core';
import { type FC } from 'react';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage } from './editorUtils';
import { LabeledToggle } from '../LabeledToggle';

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
      <LabeledToggle
        id={toggleId}
        isChecked={value}
        isDisabled={isReadonly || isDisabled}
        onChange={onChange}
        label={label}
        className="toggle-editor-control-row"
        switchClassName="toggle-editor-switch"
        labelClassName="toggle-editor-label"
        helperMessage={helperMessage}
      />
    </div>
  );
};
