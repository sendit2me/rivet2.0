import { type FC } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import TextArea from '@atlaskit/textarea';
import Select from '@atlaskit/select';
import Toggle from '@atlaskit/toggle';
import { type LlmSkill } from '@valerypopoff/rivet2-core';
import { LlmSelectorField } from '../editors/LlmSelectorEditors.js';
import { modelConfigFormStyles } from './modelConfigFormStyles.js';

type EnumOption<T extends string> = { label: string; value: T };

const REASONING_EFFORT_OPTIONS: EnumOption<NonNullable<LlmSkill['reasoningEffort']>>[] = [
  { label: 'Inherit', value: '' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];

const TOOL_CHOICE_OPTIONS: EnumOption<NonNullable<LlmSkill['toolChoice']>>[] = [
  { label: 'None', value: 'none' },
  { label: 'Auto', value: 'auto' },
  { label: 'Function', value: 'function' },
];

const RESPONSE_FORMAT_OPTIONS: EnumOption<NonNullable<LlmSkill['responseFormat']>>[] = [
  { label: 'Inherit', value: '' },
  { label: 'Text', value: 'text' },
  { label: 'JSON', value: 'json' },
  { label: 'JSON schema', value: 'json_schema' },
];

/**
 * Presentational editor for one LLM **Skill** (the behavior axis). Pure: `value` in, `onChange` out;
 * no store access (reusable by the deferred global-library panel). v1 covers the system pre-prompt
 * and the scalar/enum behavior fields. The object-valued body-params field is deferred to Phase C —
 * it drops in as one more field below, no restructure (see `modelConfigFormStyles`).
 */
export const LlmSkillForm: FC<{
  value: LlmSkill;
  onChange: (next: LlmSkill) => void;
  /** All skills, for the Extends picker (self is filtered out). */
  skills: ReadonlyArray<LlmSkill>;
  isReadonly?: boolean;
}> = ({ value, onChange, skills, isReadonly = false }) => {
  const update = (patch: Partial<LlmSkill>) => onChange({ ...value, ...patch });
  const extendsSkills = skills.filter((s) => s.id !== value.id);

  return (
    <div css={modelConfigFormStyles}>
      <Field name="skill-name" label="Name" isDisabled={isReadonly}>
        {() => (
          <TextField
            value={value.name ?? ''}
            placeholder="e.g. Developer"
            isReadOnly={isReadonly}
            onChange={(e) => update({ name: (e.target as HTMLInputElement).value })}
          />
        )}
      </Field>

      <Field name="skill-system-prompt" label="System prompt (optional)" isDisabled={isReadonly}>
        {() => (
          <TextArea
            value={value.systemPrompt ?? ''}
            minimumRows={3}
            isReadOnly={isReadonly}
            placeholder="Prepended as a system message at run time."
            onChange={(e) => update({ systemPrompt: emptyToUndefined((e.target as HTMLTextAreaElement).value) })}
          />
        )}
      </Field>

      <Field name="skill-temperature" label="Temperature (optional)" isDisabled={isReadonly}>
        {() => (
          <TextField
            type="number"
            value={numToString(value.temperature)}
            isReadOnly={isReadonly}
            onChange={(e) => update({ temperature: stringToNum((e.target as HTMLInputElement).value) })}
          />
        )}
      </Field>

      <Field name="skill-top-p" label="Top P (optional)" isDisabled={isReadonly}>
        {() => (
          <TextField
            type="number"
            value={numToString(value.top_p)}
            isReadOnly={isReadonly}
            onChange={(e) => update({ top_p: stringToNum((e.target as HTMLInputElement).value) })}
          />
        )}
      </Field>

      <Field name="skill-use-top-p" label="Use Top P instead of Temperature" isDisabled={isReadonly}>
        {() => (
          <Toggle
            isChecked={value.useTopP ?? false}
            isDisabled={isReadonly}
            onChange={(e) => update({ useTopP: e.target.checked })}
          />
        )}
      </Field>

      <Field name="skill-max-tokens" label="Max tokens (optional)" isDisabled={isReadonly}>
        {() => (
          <TextField
            type="number"
            value={numToString(value.maxTokens)}
            isReadOnly={isReadonly}
            onChange={(e) => update({ maxTokens: stringToNum((e.target as HTMLInputElement).value) })}
          />
        )}
      </Field>

      <Field name="skill-reasoning-effort" label="Reasoning effort (optional)" isDisabled={isReadonly}>
        {() => (
          <Select
            isDisabled={isReadonly}
            options={REASONING_EFFORT_OPTIONS}
            value={REASONING_EFFORT_OPTIONS.find((o) => o.value === (value.reasoningEffort ?? ''))}
            onChange={(o) => update({ reasoningEffort: o?.value || undefined })}
          />
        )}
      </Field>

      <Field name="skill-tool-choice" label="Tool choice (optional)" isDisabled={isReadonly}>
        {() => (
          <Select
            isDisabled={isReadonly}
            isClearable
            options={TOOL_CHOICE_OPTIONS}
            value={TOOL_CHOICE_OPTIONS.find((o) => o.value === value.toolChoice) ?? null}
            onChange={(o) => update({ toolChoice: o?.value })}
          />
        )}
      </Field>

      <Field name="skill-response-format" label="Response format (optional)" isDisabled={isReadonly}>
        {() => (
          <Select
            isDisabled={isReadonly}
            options={RESPONSE_FORMAT_OPTIONS}
            value={RESPONSE_FORMAT_OPTIONS.find((o) => o.value === (value.responseFormat ?? ''))}
            onChange={(o) => update({ responseFormat: o?.value || undefined })}
          />
        )}
      </Field>

      <Field name="skill-stop" label="Stop sequence (optional)" isDisabled={isReadonly}>
        {() => (
          <TextField
            value={value.stop ?? ''}
            isReadOnly={isReadonly}
            onChange={(e) => update({ stop: emptyToUndefined((e.target as HTMLInputElement).value) })}
          />
        )}
      </Field>

      {extendsSkills.length > 0 && (
        <LlmSelectorField
          items={extendsSkills}
          value={value.extends}
          name="skill-extends"
          label="Extends (optional)"
          isReadonly={isReadonly}
          placeholder="Inherit from another skill..."
          helperMessage="Inherit fields from another skill; this skill's own fields win."
          onChange={(selected) => update({ extends: selected || undefined })}
        />
      )}
    </div>
  );
};

function emptyToUndefined(value: string): string | undefined {
  return value.trim() === '' ? undefined : value;
}

function numToString(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function stringToNum(value: string): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
