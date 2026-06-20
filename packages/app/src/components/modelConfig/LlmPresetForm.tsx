import { type FC } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import { type LlmPreset, type LlmProfile, type LlmSkill } from '@valerypopoff/rivet2-core';
import { LlmSelectorField } from '../editors/LlmSelectorEditors.js';
import { modelConfigFormStyles } from './modelConfigFormStyles.js';
import { LlmOverridesForm } from './LlmOverridesForm.js';

/**
 * Presentational editor for one **Preset** (a one-pick Profile + Skill bundle — the friendly
 * "agent" entry, and the path the multi-agent harness leans on). Pure: `value` in, `onChange` out;
 * no store access. The Profile and Skill pickers reuse the exact Phase A `LlmSelectorField` (same
 * None / dangling-id semantics as the node). The object-valued override layer is deferred to
 * Phase C — it drops in below as additional fields, no restructure.
 */
export const LlmPresetForm: FC<{
  value: LlmPreset;
  onChange: (next: LlmPreset) => void;
  profiles: ReadonlyArray<LlmProfile>;
  skills: ReadonlyArray<LlmSkill>;
  isReadonly?: boolean;
}> = ({ value, onChange, profiles, skills, isReadonly = false }) => {
  const update = (patch: Partial<LlmPreset>) => onChange({ ...value, ...patch });

  return (
    <div css={modelConfigFormStyles}>
      <Field name="preset-name" label="Name" isDisabled={isReadonly}>
        {() => (
          <TextField
            value={value.name ?? ''}
            placeholder="e.g. Planner (Claude) or Coder (Qwen)"
            isReadOnly={isReadonly}
            onChange={(e) => update({ name: (e.target as HTMLInputElement).value })}
          />
        )}
      </Field>

      <LlmSelectorField
        items={profiles}
        value={value.profileId}
        name="preset-profile"
        label="Profile (connection)"
        isReadonly={isReadonly}
        placeholder="Select a profile..."
        helperMessage="The connection (provider / base URL / key) this preset uses."
        onChange={(selected) => update({ profileId: selected })}
      />

      <LlmSelectorField
        items={skills}
        value={value.skillId}
        name="preset-skill"
        label="Skill (behavior, optional)"
        isReadonly={isReadonly}
        placeholder="Select a skill..."
        helperMessage="The behavior (sampling / model) this preset applies. Leave None for connection-only."
        onChange={(selected) => update({ skillId: selected || undefined })}
      />

      <div className="model-config-form-subsection">
        <div className="model-config-form-subsection-title">Overrides (advanced)</div>
        <p className="model-config-form-subsection-help">
          Tweak fields on top of the resolved Profile + Skill. Each field is off (inherited) until you toggle it on —
          toggling on overrides it, toggling off goes back to inheriting.
        </p>
        <LlmOverridesForm
          value={value.overrides}
          isReadonly={isReadonly}
          onChange={(overrides) => update({ overrides })}
        />
      </div>
    </div>
  );
};
