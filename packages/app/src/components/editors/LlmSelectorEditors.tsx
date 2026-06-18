import {
  type ChartNode,
  type LlmPresetSelectorEditorDefinition,
  type LlmProfileSelectorEditorDefinition,
  type LlmSkillSelectorEditorDefinition,
} from '@valerypopoff/rivet2-core';
import { type FC } from 'react';
import { type SharedEditorProps } from './SharedEditorProps';
import { Field, HelperMessage } from '@atlaskit/form';
import Select from '@atlaskit/select';
import { useAtomValue } from 'jotai';
import { settingsState } from '../../state/settings';
import { getHelperMessage } from './editorUtils';
import { getLlmSelectorOptions, LLM_SELECTOR_NONE_VALUE } from '../../utils/llmSelectorOptions';

/**
 * Shared field for the three LLM selectors (Feature 005, Phase A). Builds options from the given
 * Settings entities via `getLlmSelectorOptions` (None + sorted + dangling-id row) and renders an
 * Atlaskit Select. Mirrors `GraphSelectorEditor`'s structure against `settingsState`.
 */
const LlmSelectorField: FC<{
  items: ReadonlyArray<{ id: string; name?: string }>;
  value: string | undefined;
  name: string;
  label: string;
  isReadonly: boolean;
  helperMessage?: string;
  placeholder: string;
  onChange: (selected: string) => void;
}> = ({ items, value, name, label, isReadonly, helperMessage, placeholder, onChange }) => {
  const options = getLlmSelectorOptions(items, { selectedId: value });
  const selectedOption = options.find((option) => option.value === (value ?? LLM_SELECTOR_NONE_VALUE));

  return (
    <Field name={name} label={label} isDisabled={isReadonly}>
      {({ fieldProps }) => (
        <>
          {helperMessage && <HelperMessage>{helperMessage}</HelperMessage>}
          <Select
            {...fieldProps}
            isDisabled={isReadonly}
            options={options}
            value={selectedOption}
            onChange={(selected) => onChange(selected!.value)}
            placeholder={placeholder}
          />
        </>
      )}
    </Field>
  );
};

export const DefaultLlmProfileSelectorEditor: FC<
  SharedEditorProps & { editor: LlmProfileSelectorEditorDefinition<ChartNode> }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const data = node.data as Record<string, unknown>;
  const settings = useAtomValue(settingsState);

  return (
    <LlmSelectorField
      items={settings.llmProfiles ?? []}
      value={data[editor.dataKey] as string | undefined}
      name={editor.dataKey}
      label={editor.label}
      isReadonly={isReadonly || isDisabled}
      helperMessage={getHelperMessage(editor, node.data)}
      placeholder="Select Profile..."
      onChange={(selected) => onChange({ ...node, data: { ...data, [editor.dataKey]: selected } })}
    />
  );
};

export const DefaultLlmSkillSelectorEditor: FC<
  SharedEditorProps & { editor: LlmSkillSelectorEditorDefinition<ChartNode> }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const data = node.data as Record<string, unknown>;
  const settings = useAtomValue(settingsState);

  return (
    <LlmSelectorField
      items={settings.llmSkills ?? []}
      value={data[editor.dataKey] as string | undefined}
      name={editor.dataKey}
      label={editor.label}
      isReadonly={isReadonly || isDisabled}
      helperMessage={getHelperMessage(editor, node.data)}
      placeholder="Select Skill..."
      onChange={(selected) => onChange({ ...node, data: { ...data, [editor.dataKey]: selected } })}
    />
  );
};

export const DefaultLlmPresetSelectorEditor: FC<
  SharedEditorProps & { editor: LlmPresetSelectorEditorDefinition<ChartNode> }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const data = node.data as Record<string, unknown>;
  const settings = useAtomValue(settingsState);

  return (
    <LlmSelectorField
      items={settings.llmPresets ?? []}
      value={data[editor.dataKey] as string | undefined}
      name={editor.dataKey}
      label={editor.label}
      isReadonly={isReadonly || isDisabled}
      helperMessage={getHelperMessage(editor, node.data)}
      placeholder="Select Preset..."
      onChange={(selected) => onChange({ ...node, data: { ...data, [editor.dataKey]: selected } })}
    />
  );
};
