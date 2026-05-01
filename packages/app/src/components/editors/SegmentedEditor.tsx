import { Field } from '@atlaskit/form';
import { css } from '@emotion/react';
import { type ChartNode, type SegmentedEditorDefinition } from '@ironclad/rivet-core';
import { type FC } from 'react';
import { FieldHelperMessage } from '../FieldHelperMessage.js';
import { type SharedEditorProps } from './SharedEditorProps';
import { getHelperMessage } from './editorUtils';

const segmentedEditorStyles = css`
  .segmented-choice {
    display: inline-flex;
    align-items: center;
    min-height: calc(32px * var(--ui-font-scale));
    gap: calc(3px * var(--ui-font-scale));
    padding: calc(3px * var(--ui-font-scale));
    margin-left: -0.2em;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: calc(32px * var(--ui-font-scale));
    corner-shape: superellipse(1.15);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 1px 2px rgba(0, 0, 0, 0.18);
  }

  .segmented-choice-option {
    min-width: 0;
    height: calc(24px * var(--ui-font-scale));
    padding: 0 calc(12px * var(--ui-font-scale));
    border: 0;
    border-radius: calc(24px * var(--ui-font-scale));
    corner-shape: superellipse(1.15);
    background: transparent;
    color: var(--grey-lightish);
    font: inherit;
    font-size: var(--ui-font-size-compact);
    font-weight: 700;
    line-height: calc(24px * var(--ui-font-scale));
    cursor: pointer;
    transition:
      background-color 0.14s ease-out,
      color 0.14s ease-out,
      box-shadow 0.14s ease-out;
  }

  .segmented-choice-option:first-of-type {
    padding-left: calc(12px * var(--ui-font-scale));
  }

  .segmented-choice-option:last-of-type {
    padding-right: calc(12px * var(--ui-font-scale));
  }

  .segmented-choice-option:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--grey-light);
  }

  .segmented-choice-option.is-active {
    background: var(--primary);
    color: var(--grey-darkest);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.24),
      0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .segmented-choice-option:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
`;

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
  options: readonly { label: string; value: string | boolean }[];
  defaultValue?: string | boolean;
}> = ({ value, onChange, isReadonly, isDisabled, label, ariaLabel, name, helperMessage, options, defaultValue }) => {
  const selectedValue = value ?? defaultValue ?? options[0]?.value;
  const disabled = isReadonly || isDisabled;
  const visibleLabel = label.trim() ? label : undefined;
  const effectiveAriaLabel = ariaLabel ?? visibleLabel ?? name ?? 'Segmented choice';
  const control = (
    <div className="segmented-editor-control" css={segmentedEditorStyles}>
      {helperMessage && <FieldHelperMessage>{helperMessage}</FieldHelperMessage>}
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
    </div>
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
