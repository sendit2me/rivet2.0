import { type FC } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import { type LlmSkill } from '@valerypopoff/rivet2-core';
import { LlmSelectorField } from '../editors/LlmSelectorEditors.js';
import { modelConfigFormStyles } from './modelConfigFormStyles.js';
import { BehaviorFields, BEHAVIOR_KEYS, mergeKeys, pickKeys } from './modelConfigFields.js';
import { JsonObjectField } from './JsonObjectField.js';

/**
 * Presentational editor for one LLM **Skill** (the behavior axis). Pure: `value` in, `onChange` out;
 * no store access (reusable by the deferred global-library panel). Behavior fields come from the
 * shared {@link BehaviorFields} group (also used by the preset overrides editor). The object-valued
 * `extraBody` (Feature 004) is the generic per-request body escape hatch, edited via the shared
 * {@link JsonObjectField}.
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

      <BehaviorFields
        value={pickKeys(value, BEHAVIOR_KEYS)}
        onChange={(behavior) => onChange(mergeKeys(value, BEHAVIOR_KEYS, behavior))}
        mode="direct"
        idPrefix="skill"
        isReadonly={isReadonly}
      />

      <JsonObjectField
        value={value.extraBody}
        label="Extra Body (JSON)"
        name="skill-extraBody"
        isReadonly={isReadonly}
        helperMessage='Generic per-request body params, e.g. { "chat_template_kwargs": { "enable_thinking": false } }. Leave blank for none.'
        onChange={(next) => update({ extraBody: next })}
      />

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
    </div>
  );
};
