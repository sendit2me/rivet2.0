import { type FC, useState } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import { type LlmProfile } from '@valerypopoff/rivet2-core';
import { entries } from '../../utils/typeSafety.js';
import { KeyValuePairs } from '../editors/KeyValuePairEditor.js';
import { LlmSelectorField } from '../editors/LlmSelectorEditors.js';
import { modelConfigFormStyles } from './modelConfigFormStyles.js';

/**
 * Presentational editor for one LLM **Profile** (the connection axis). Pure: `value` in, `onChange`
 * out — it never reads or writes any store, so the deferred global-library panel can reuse it
 * verbatim against a different store. Persistence (the project store write + flush) lives in the panel.
 *
 * Fields are GENERIC OpenAI-compatible connection fields (API endpoint / Model / API key / headers)
 * — never server-specific. Server-specific body params are `extraBody` (deferred to Phase C).
 */
export const LlmProfileForm: FC<{
  value: LlmProfile;
  onChange: (next: LlmProfile) => void;
  /** All profiles, for the Extends picker (self is filtered out). */
  profiles: ReadonlyArray<LlmProfile>;
  isReadonly?: boolean;
}> = ({ value, onChange, profiles, isReadonly = false }) => {
  const update = (patch: Partial<LlmProfile>) => onChange({ ...value, ...patch });

  // Local header-pair state (keys may be transiently empty/duplicate while editing) — mirrors the
  // OpenAI settings page. Seeded once from the entity; emits a normalized record on change.
  const [headerPairs, setHeaderPairs] = useState<{ key: string; value: string }[]>(
    entries(value.headers ?? {}).map(([key, val]) => ({ key, value: val })),
  );

  const commitHeaders = (pairs: { key: string; value: string }[]) => {
    setHeaderPairs(pairs);
    const headers = Object.fromEntries(pairs.filter(({ key }) => key.trim() !== '').map(({ key, value: v }) => [key, v]));
    update({ headers: Object.keys(headers).length > 0 ? headers : undefined });
  };

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

      <Field name="profile-endpoint" label="API endpoint" isDisabled={isReadonly}>
        {() => (
          <TextField
            value={value.endpoint ?? ''}
            placeholder="https://host/v1/chat/completions — leave blank to use the global endpoint"
            isReadOnly={isReadonly}
            onChange={(e) => update({ endpoint: emptyToUndefined((e.target as HTMLInputElement).value) })}
          />
        )}
      </Field>

      <Field name="profile-model" label="Model" isDisabled={isReadonly}>
        {() => (
          <TextField
            value={value.defaultModel ?? ''}
            placeholder="Default model when a node leaves its Model blank"
            isReadOnly={isReadonly}
            onChange={(e) => update({ defaultModel: emptyToUndefined((e.target as HTMLInputElement).value) })}
          />
        )}
      </Field>

      <Field name="profile-api-key" label="API key" isDisabled={isReadonly}>
        {() => (
          <TextField
            type="password"
            value={value.apiKey ?? ''}
            placeholder="Leave blank to use the global key"
            isReadOnly={isReadonly}
            onChange={(e) => update({ apiKey: emptyToUndefined((e.target as HTMLInputElement).value) })}
          />
        )}
      </Field>

      <Field name="profile-organization" label="Organization (optional)" isDisabled={isReadonly}>
        {() => (
          <TextField
            value={value.organization ?? ''}
            isReadOnly={isReadonly}
            onChange={(e) => update({ organization: emptyToUndefined((e.target as HTMLInputElement).value) })}
          />
        )}
      </Field>

      <KeyValuePairs
        label="Headers"
        name="profile-headers"
        isReadonly={isReadonly}
        keyValuePairs={headerPairs}
        onAddPair={() => commitHeaders([...headerPairs, { key: '', value: '' }])}
        onDeletePair={(index) => commitHeaders(headerPairs.filter((_, i) => i !== index))}
        onPairChange={(index, keyOrValue, v) =>
          commitHeaders(headerPairs.map((pair, i) => (i === index ? { ...pair, [keyOrValue]: v } : pair)))
        }
      />

      {extendsProfiles.length > 0 && (
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
      )}
    </div>
  );
};

function emptyToUndefined(value: string): string | undefined {
  return value.trim() === '' ? undefined : value;
}
