import { type FC, type ReactNode } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import Select from '@atlaskit/select';
import Toggle from '@atlaskit/toggle';
import { css } from '@emotion/react';
import { entries } from '../../utils/typeSafety.js';
import { KeyValuePairs } from '../editors/KeyValuePairEditor.js';

/**
 * Shared, store-free field groups for the model-config forms, re-targeted onto the chat-v2 fan-out
 * shape (Feature 008). One definition of the connection / base / override fields, used by:
 *  - `LlmProfileForm`     → ProfileConnectionFields, `mode='direct'`
 *  - `LlmSkillForm`       → SkillBaseFields, `mode='direct'`
 *  - `LlmOverridesForm`   → OverrideFields, `mode='override'`
 *
 * **Direct vs override (the load-bearing distinction).** A Profile/Skill carries values; an absent
 * field just means "unset". A Preset's `overrides` is a *partial* where **absent key = inherit**, so
 * "not overridden" must stay distinguishable from "set to empty/zero". In `override` mode every scalar
 * gets a per-field presence **toggle**: ON writes the key, OFF removes it; the editor reads/writes by
 * key PRESENCE, not value. Enums with an explicit "Inherit" option express inherit by their empty state.
 *
 * Authoring UX here is intentionally **functional-minimal** (008a): provider-aware connection, the
 * generic Skill base, and common overrides. Polished provider-block authoring is deferred to the
 * 009-era selection UX.
 */

export type ModelConfigFieldMode = 'direct' | 'override';

export const PROFILE_CONNECTION_KEYS = [
  'provider',
  'baseURL',
  'customProviderBaseURL',
  'apiKeySource',
  'customProviderApiKeyEnvVarName',
  'defaultModel',
  'headers',
] as const;

export const SKILL_BASE_KEYS = [
  'temperature',
  'maxTokens',
  'topP',
  'topK',
  'presencePenalty',
  'frequencyPenalty',
  'seed',
  'responseFormat',
  'reasoningLevel',
] as const;

export const OVERRIDE_KEYS = [
  'model',
  'temperature',
  'maxTokens',
  'topP',
  'topK',
  'presencePenalty',
  'frequencyPenalty',
  'seed',
  'responseFormat',
] as const;

/** Take only `keys` that are present (defined) on `obj`. */
export function pickKeys(obj: object, keys: readonly string[]): Record<string, unknown> {
  const source = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source && source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

/** Replace `keys` on `base` with the (present) keys from `sub` — deletions drop, undefined drops. */
export function mergeKeys<T>(base: T, keys: readonly string[], sub: Record<string, unknown>): T {
  const next: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of keys) {
    delete next[key];
  }
  for (const [key, value] of Object.entries(sub)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next as T;
}

const styles = css`
  display: flex;
  flex-direction: column;
  gap: 10px;

  .override-field-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .override-field-row > :last-child {
    flex: 1 1 auto;
    min-width: 0;
  }
`;

function setOrOmit(value: Record<string, unknown>, key: string, next: unknown): Record<string, unknown> {
  if (next === undefined) {
    const { [key]: _omit, ...rest } = value;
    return rest;
  }
  return { ...value, [key]: next };
}

function numToString(value: unknown): string {
  return typeof value === 'number' ? String(value) : '';
}

function stringToNum(value: string): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Wraps a field: in `direct` mode it is a plain labelled control; in `override` mode it gains a
 * leading presence toggle and the control is disabled until the toggle is on.
 */
const OverridableRow: FC<{
  mode: ModelConfigFieldMode;
  name: string;
  label: string;
  present: boolean;
  isReadonly: boolean;
  onPresent: (on: boolean) => void;
  children: (disabled: boolean) => ReactNode;
}> = ({ mode, name, label, present, isReadonly, onPresent, children }) => {
  if (mode === 'direct') {
    return (
      <Field name={name} label={label} isDisabled={isReadonly}>
        {() => <>{children(isReadonly)}</>}
      </Field>
    );
  }

  return (
    <Field name={name} label={label} isDisabled={isReadonly}>
      {() => (
        <div className="override-field-row">
          <Toggle
            isChecked={present}
            isDisabled={isReadonly}
            label={`Override ${label}`}
            onChange={(e) => onPresent(e.target.checked)}
          />
          {children(isReadonly || !present)}
        </div>
      )}
    </Field>
  );
};

type GroupHelpers = {
  mode: ModelConfigFieldMode;
  isReadonly: boolean;
  idPrefix: string;
  value: Record<string, unknown>;
  set: (key: string, next: unknown) => void;
  present: (key: string) => boolean;
  setPresent: (key: string, on: boolean, initial: unknown) => void;
};

function makeHelpers(
  value: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  mode: ModelConfigFieldMode,
  isReadonly: boolean,
  idPrefix: string,
): GroupHelpers {
  const set = (key: string, next: unknown) => onChange(setOrOmit(value, key, next));
  return {
    mode,
    isReadonly,
    idPrefix,
    value,
    set,
    present: (key: string) => (mode === 'override' ? key in value : true),
    setPresent: (key: string, on: boolean, initial: unknown) => set(key, on ? initial : undefined),
  };
}

/** A string row; in override mode an empty value is a real override (kept), in direct mode it omits. */
const StringRow: FC<{ h: GroupHelpers; field: string; label: string; placeholder?: string; password?: boolean }> = ({
  h,
  field,
  label,
  placeholder,
  password,
}) => (
  <OverridableRow
    mode={h.mode}
    name={`${h.idPrefix}-${field}`}
    label={label}
    present={h.present(field)}
    isReadonly={h.isReadonly}
    onPresent={(on) => h.setPresent(field, on, '')}
  >
    {(disabled) => (
      <TextField
        type={password ? 'password' : 'text'}
        value={(h.value[field] as string) ?? ''}
        placeholder={placeholder}
        isReadOnly={disabled}
        onChange={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          h.set(field, h.mode === 'override' ? raw : raw.trim() === '' ? undefined : raw);
        }}
      />
    )}
  </OverridableRow>
);

const NumberRow: FC<{ h: GroupHelpers; field: string; label: string }> = ({ h, field, label }) => (
  <OverridableRow
    mode={h.mode}
    name={`${h.idPrefix}-${field}`}
    label={label}
    present={h.present(field)}
    isReadonly={h.isReadonly}
    onPresent={(on) => h.setPresent(field, on, 0)}
  >
    {(disabled) => (
      <TextField
        type="number"
        value={numToString(h.value[field])}
        isReadOnly={disabled}
        onChange={(e) => {
          const parsed = stringToNum((e.target as HTMLInputElement).value);
          // override mode keeps the key present (empty → 0); direct mode omits on empty.
          h.set(field, h.mode === 'override' ? (parsed ?? 0) : parsed);
        }}
      />
    )}
  </OverridableRow>
);

type EnumOption = { label: string; value: string };

/** Enum select. In direct mode the "Inherit" ('') option expresses absence; in override mode the
 *  presence toggle does, so the Inherit option is dropped. */
const EnumRow: FC<{
  h: GroupHelpers;
  field: string;
  label: string;
  options: EnumOption[];
  /** When true an empty value is allowed in direct mode (no Inherit option to drop on override). */
  clearable?: boolean;
  /** Keep the empty option even in direct mode (e.g. a required enum that defaults to a concrete value). */
  alwaysConcrete?: boolean;
}> = ({ h, field, label, options, clearable, alwaysConcrete }) => {
  const concreteOptions = h.mode === 'override' || alwaysConcrete ? options.filter((o) => o.value !== '') : options;
  const current = (h.value[field] as string) ?? '';
  return (
    <OverridableRow
      mode={h.mode}
      name={`${h.idPrefix}-${field}`}
      label={label}
      present={h.present(field)}
      isReadonly={h.isReadonly}
      onPresent={(on) => h.setPresent(field, on, concreteOptions[0]?.value ?? '')}
    >
      {(disabled) => (
        <Select
          isDisabled={disabled}
          isClearable={clearable && h.mode === 'direct'}
          options={concreteOptions}
          value={concreteOptions.find((o) => o.value === current) ?? null}
          onChange={(o) => {
            const picked = (o as EnumOption | null)?.value;
            // direct: '' / cleared → omit (or keep if alwaysConcrete); override → keep the picked value.
            h.set(field, h.mode === 'override' || alwaysConcrete ? picked : picked || undefined);
          }}
        />
      )}
    </OverridableRow>
  );
};

const PROVIDER_OPTIONS: EnumOption[] = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google', value: 'google' },
  { label: 'Custom provider', value: 'custom' },
];
const API_KEY_SOURCE_OPTIONS: EnumOption[] = [
  { label: 'Environment', value: 'environment' },
  { label: 'Input port', value: 'input' },
];
const REASONING_LEVEL_OPTIONS: EnumOption[] = [
  { label: 'Inherit', value: '' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];
const RESPONSE_FORMAT_OPTIONS: EnumOption[] = [
  { label: 'Inherit', value: '' },
  { label: 'Text', value: 'text' },
  { label: 'JSON', value: 'json' },
  { label: 'JSON schema', value: 'json_schema' },
];

/** Profile connection fields (chat-v2): provider, the right base URL, key source, model, headers. */
export const ProfileConnectionFields: FC<{
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  idPrefix: string;
  isReadonly?: boolean;
}> = ({ value, onChange, idPrefix, isReadonly = false }) => {
  const h = makeHelpers(value, onChange, 'direct', isReadonly, idPrefix);
  const isCustom = value.provider === 'custom';
  const headerPairs = entries((value.headers ?? {}) as Record<string, string>).map(([key, val]) => ({ key, value: val }));
  const commitHeaders = (pairs: { key: string; value: string }[]) => {
    const headers = Object.fromEntries(pairs.filter(({ key }) => key.trim() !== '').map(({ key, value: v }) => [key, v]));
    h.set('headers', Object.keys(headers).length > 0 ? headers : undefined);
  };

  return (
    <div css={styles}>
      <EnumRow h={h} field="provider" label="Provider" options={PROVIDER_OPTIONS} alwaysConcrete />
      {isCustom ? (
        <>
          <StringRow
            h={h}
            field="customProviderBaseURL"
            label="Provider base URL"
            placeholder="http://host:port/v1 — required for a custom OpenAI-compatible provider"
          />
          <StringRow
            h={h}
            field="customProviderApiKeyEnvVarName"
            label="API key env var (optional)"
            placeholder="e.g. CUSTOM_PROVIDER_API_KEY"
          />
        </>
      ) : (
        <StringRow
          h={h}
          field="baseURL"
          label="Base URL (optional)"
          placeholder="Leave blank to use the provider default endpoint"
        />
      )}
      <EnumRow h={h} field="apiKeySource" label="API key source" options={API_KEY_SOURCE_OPTIONS} alwaysConcrete />
      <StringRow h={h} field="defaultModel" label="Fallback model (optional)" placeholder="Used when the node and skill leave Model blank" />
      <KeyValuePairs
        label="Headers"
        name={`${idPrefix}-headers`}
        isReadonly={isReadonly}
        keyValuePairs={headerPairs}
        onAddPair={() => commitHeaders([...headerPairs, { key: '', value: '' }])}
        onDeletePair={(index) => commitHeaders(headerPairs.filter((_, i) => i !== index))}
        onPairChange={(index, keyOrValue, v) =>
          commitHeaders(headerPairs.map((pair, i) => (i === index ? { ...pair, [keyOrValue]: v } : pair)))
        }
      />
    </div>
  );
};

/** Skill base fields (chat-v2): the provider-agnostic sampling / format params + coarse reasoning. */
export const SkillBaseFields: FC<{
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  isReadonly?: boolean;
}> = ({ value, onChange, isReadonly = false }) => {
  const h = makeHelpers(value, onChange, 'direct', isReadonly, 'skill-base');
  return (
    <div css={styles}>
      <NumberRow h={h} field="temperature" label="Temperature (optional)" />
      <NumberRow h={h} field="maxTokens" label="Max tokens (optional)" />
      <NumberRow h={h} field="topP" label="Top P (optional)" />
      <NumberRow h={h} field="topK" label="Top K (optional)" />
      <NumberRow h={h} field="presencePenalty" label="Presence penalty (optional)" />
      <NumberRow h={h} field="frequencyPenalty" label="Frequency penalty (optional)" />
      <NumberRow h={h} field="seed" label="Seed (optional)" />
      <EnumRow h={h} field="responseFormat" label="Response format (optional)" options={RESPONSE_FORMAT_OPTIONS} />
      <EnumRow h={h} field="reasoningLevel" label="Reasoning level (optional)" options={REASONING_LEVEL_OPTIONS} />
    </div>
  );
};

/** Preset-override fields (chat-v2): common effective fields, each gated by a presence toggle. */
export const OverrideFields: FC<{
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  idPrefix: string;
  isReadonly?: boolean;
}> = ({ value, onChange, idPrefix, isReadonly = false }) => {
  const h = makeHelpers(value, onChange, 'override', isReadonly, idPrefix);
  return (
    <div css={styles}>
      <StringRow h={h} field="model" label="Model" />
      <NumberRow h={h} field="temperature" label="Temperature" />
      <NumberRow h={h} field="maxTokens" label="Max tokens" />
      <NumberRow h={h} field="topP" label="Top P" />
      <NumberRow h={h} field="topK" label="Top K" />
      <NumberRow h={h} field="presencePenalty" label="Presence penalty" />
      <NumberRow h={h} field="frequencyPenalty" label="Frequency penalty" />
      <NumberRow h={h} field="seed" label="Seed" />
      <EnumRow h={h} field="responseFormat" label="Response format" options={RESPONSE_FORMAT_OPTIONS} />
    </div>
  );
};
