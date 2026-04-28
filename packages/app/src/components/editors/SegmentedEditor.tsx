import { Field, HelperMessage } from '@atlaskit/form';
import { type ChartNode, type SegmentedEditorDefinition } from '@ironclad/rivet-core';
import { type FC } from 'react';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage } from './editorUtils';

export const DefaultSegmentedEditor: FC<
  SharedEditorProps & {
    editor: SegmentedEditorDefinition<ChartNode>;
  }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const data = node.data as Record<string, unknown>;
  const helperMessage = getHelperMessage(editor, node.data);

  return (
    <SegmentedEditor
      value={data[editor.dataKey] as string | boolean | undefined}
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
      ariaLabel={editor.ariaLabel}
      name={editor.dataKey}
      helperMessage={helperMessage}
      options={editor.options}
      defaultValue={editor.defaultValue}
    />
  );
};

export const SegmentedEditor: FC<{
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
  isDisabled: boolean;
  isReadonly: boolean;
  label: string;
  ariaLabel?: string;
  name?: string;
  helperMessage?: string;
  options: { label: string; value: string | boolean }[];
  defaultValue?: string | boolean;
}> = ({ value, onChange, isReadonly, isDisabled, label, ariaLabel, name, helperMessage, options, defaultValue }) => {
  const selectedValue = value ?? defaultValue ?? options[0]?.value;
  const disabled = isReadonly || isDisabled;
  const visibleLabel = label.trim() ? label : undefined;
  const effectiveAriaLabel = ariaLabel ?? visibleLabel ?? name ?? 'Segmented choice';
  const control = (
    <>
      {helperMessage && <HelperMessage>{helperMessage}</HelperMessage>}
      <div className="segmented-choice" role="group" aria-label={effectiveAriaLabel}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={`segmented-choice-option${option.value === selectedValue ? ' is-active' : ''}`}
            aria-pressed={option.value === selectedValue}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );

  if (!visibleLabel) {
    return <div className="segmented-editor-field">{control}</div>;
  }

  return (
    <Field name={name ?? visibleLabel} label={visibleLabel} isDisabled={disabled}>
      {() => control}
    </Field>
  );
};
