import { type FC } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import { type LlmProfile } from '@valerypopoff/rivet2-core';
import { LlmSelectorField } from '../editors/LlmSelectorEditors.js';
import { modelConfigFormStyles } from './modelConfigFormStyles.js';
import { ProfileConnectionFields, PROFILE_CONNECTION_KEYS, mergeKeys, pickKeys } from './modelConfigFields.js';

/**
 * Presentational editor for one LLM **Profile** (the connection axis, chat-v2 shape). Pure: `value`
 * in, `onChange` out — it never reads or writes any store, so the deferred global-library panel can
 * reuse it verbatim. Persistence (the project store write + flush) lives in the panel.
 *
 * Connection fields come from the shared {@link ProfileConnectionFields} group: provider, the right
 * base URL, key source, fallback model, headers. The per-request model + behaviour live on the Skill.
 */
export const LlmProfileForm: FC<{
  value: LlmProfile;
  onChange: (next: LlmProfile) => void;
  /** All profiles, for the Extends picker (self is filtered out). */
  profiles: ReadonlyArray<LlmProfile>;
  isReadonly?: boolean;
}> = ({ value, onChange, profiles, isReadonly = false }) => {
  const update = (patch: Partial<LlmProfile>) => onChange({ ...value, ...patch });
  const extendsProfiles = profiles.filter((p) => p.id !== value.id);

  return (
    <div css={modelConfigFormStyles}>
      <Field name="profile-name" label="Name" isDisabled={isReadonly}>
        {() => (
          <TextField
            value={value.name ?? ''}
            placeholder="e.g. Claude (planning)"
            isReadOnly={isReadonly}
            onChange={(e) => update({ name: (e.target as HTMLInputElement).value })}
          />
        )}
      </Field>

      <ProfileConnectionFields
        value={pickKeys(value, PROFILE_CONNECTION_KEYS)}
        onChange={(conn) => onChange(mergeKeys(value, PROFILE_CONNECTION_KEYS, conn))}
        idPrefix="profile"
        isReadonly={isReadonly}
      />

      <LlmSelectorField
        items={extendsProfiles}
        value={value.extends}
        name="profile-extends"
        label="Extends (optional)"
        isReadonly={isReadonly}
        placeholder="Inherit from another profile..."
        helperMessage="Inherit fields from another profile; this profile's own fields win."
        onChange={(selected) => update({ extends: selected || undefined })}
      />
    </div>
  );
};
