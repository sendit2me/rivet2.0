import { type FC, type ReactNode } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import TextArea from '@atlaskit/textarea';
import Select from '@atlaskit/select';
import Toggle from '@atlaskit/toggle';
import { css } from '@emotion/react';
import { type LlmPresetOverrides } from '@valerypopoff/rivet2-core';
import { entries } from '../../utils/typeSafety.js';
import { KeyValuePairs } from '../editors/KeyValuePairEditor.js';

/**
 * Shared, store-free field groups for the model-config forms (Feature 005 Phase C1). One definition
 * of the connection and behavior fields, used three ways:
 *  - `LlmProfileForm` → ConnectionFields, `mode='direct'`
 *  - `LlmSkillForm`   → BehaviorFields, `mode='direct'`
 *  - `LlmOverridesForm` (preset overrides) → both, `mode='override'`
 *
 * **Direct vs override (the load-bearing distinction).** A Profile/Skill carries values; an absent
 * field just means "unset". A Preset's `overrides` is a *partial* where **absent key = inherit**, so
 * "not overridden" must be distinguishable from "set to empty/zero/false". In `override` mode every
 * scalar field gets a per-field presence **toggle**: ON writes the key, OFF removes it; the editor
 * reads/writes by key PRESENCE, not by value. Enums with an explicit "Inherit" option and the
 * record field (headers) express inherit by their own empty state, so they need no extra toggle.
 */

export type ModelConfigFieldMode = 'direct' | 'override';

export type ConnectionValues = Pick<
  LlmPresetOverrides,
  'endpoint' | 'apiKey' | 'organization' | 'headers' | 'defaultModel'
>;
export type BehaviorValues = Pick<
  LlmPresetOverrides,
  'systemPrompt' | 'temperature' | 'top_p' | 'useTopP' | 'maxTokens' | 'reasoningEffort' | 'toolChoice' | 'responseFormat' | 'stop'
>;

export const CONNECTION_KEYS = ['endpoint', 'apiKey', 'organization', 'headers', 'defaultModel'] as const;
export const BEHAVIOR_KEYS = [
  'systemPrompt',
  'temperature',
  'top_p',
  'useTopP',
  'maxTokens',
  'reasoningEffort',
  'toolChoice',
  'responseFormat',
  'stop',
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

const BoolRow: FC<{ h: GroupHelpers; field: string; label: string }> = ({ h, field, label }) => (
  <OverridableRow
    mode={h.mode}
    name={`${h.idPrefix}-${field}`}
    label={label}
    present={h.present(field)}
    isReadonly={h.isReadonly}
    onPresent={(on) => h.setPresent(field, on, false)}
  >
    {(disabled) => (
      <Toggle
        isChecked={Boolean(h.value[field])}
        isDisabled={disabled}
        onChange={(e) => h.set(field, e.target.checked)}
      />
    )}
  </OverridableRow>
);

type EnumOption = { label: string; value: string };

/** Enum select. In direct mode the "Inherit" ('') option expresses absence; in override mode the
 *  presence toggle does, so the Inherit option is dropped. */
const EnumRow: FC<{ h: GroupHelpers; field: string; label: string; options: EnumOption[]; clearable?: boolean }> = ({
  h,
  field,
  label,
  options,
  clearable,
}) => {
  const concreteOptions = h.mode === 'override' ? options.filter((o) => o.value !== '') : options;
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
            // direct: '' / cleared → omit; override (toggle present) → keep the picked concrete value.
            h.set(field, h.mode === 'override' ? picked : picked || undefined);
          }}
        />
      )}
    </OverridableRow>
  );
};

const REASONING_EFFORT_OPTIONS: EnumOption[] = [
  { label: 'Inherit', value: '' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];
const TOOL_CHOICE_OPTIONS: EnumOption[] = [
  { label: 'None', value: 'none' },
  { label: 'Auto', value: 'auto' },
  { label: 'Function', value: 'function' },
];
const RESPONSE_FORMAT_OPTIONS: EnumOption[] = [
  { label: 'Inherit', value: '' },
  { label: 'Text', value: 'text' },
  { label: 'JSON', value: 'json' },
  { label: 'JSON schema', value: 'json_schema' },
];

export const ConnectionFields: FC<{
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  mode: ModelConfigFieldMode;
  idPrefix: string;
  isReadonly?: boolean;
}> = ({ value, onChange, mode, idPrefix, isReadonly = false }) => {
  const h = makeHelpers(value, onChange, mode, isReadonly, idPrefix);
  const headerPairs = entries((value.headers ?? {}) as Record<string, string>).map(([key, val]) => ({ key, value: val }));
  const commitHeaders = (pairs: { key: string; value: string }[]) => {
    const headers = Object.fromEntries(pairs.filter(({ key }) => key.trim() !== '').map(({ key, value: v }) => [key, v]));
    h.set('headers', Object.keys(headers).length > 0 ? headers : undefined);
  };

  return (
    <div css={styles}>
      <StringRow
        h={h}
        field="endpoint"
        label="API endpoint"
        placeholder="https://host/v1/chat/completions — leave blank to use the global endpoint"
      />
      <StringRow h={h} field="defaultModel" label="Model" placeholder="Default model when a node leaves its Model blank" />
      <StringRow h={h} field="apiKey" label="API key" placeholder="Leave blank to use the global key" password />
      <StringRow h={h} field="organization" label="Organization (optional)" />
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

export const BehaviorFields: FC<{
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  mode: ModelConfigFieldMode;
  idPrefix: string;
  isReadonly?: boolean;
}> = ({ value, onChange, mode, idPrefix, isReadonly = false }) => {
  const h = makeHelpers(value, onChange, mode, isReadonly, idPrefix);

  return (
    <div css={styles}>
      <OverridableRow
        mode={mode}
        name={`${idPrefix}-systemPrompt`}
        label="System prompt (optional)"
        present={h.present('systemPrompt')}
        isReadonly={isReadonly}
        onPresent={(on) => h.setPresent('systemPrompt', on, '')}
      >
        {(disabled) => (
          <TextArea
            value={(value.systemPrompt as string) ?? ''}
            minimumRows={3}
            isReadOnly={disabled}
            placeholder="Prepended as a system message at run time."
            onChange={(e) => {
              const raw = (e.target as HTMLTextAreaElement).value;
              h.set('systemPrompt', mode === 'override' ? raw : raw.trim() === '' ? undefined : raw);
            }}
          />
        )}
      </OverridableRow>
      <NumberRow h={h} field="temperature" label="Temperature (optional)" />
      <NumberRow h={h} field="top_p" label="Top P (optional)" />
      <BoolRow h={h} field="useTopP" label="Use Top P instead of Temperature" />
      <NumberRow h={h} field="maxTokens" label="Max tokens (optional)" />
      <EnumRow h={h} field="reasoningEffort" label="Reasoning effort (optional)" options={REASONING_EFFORT_OPTIONS} />
      <EnumRow h={h} field="toolChoice" label="Tool choice (optional)" options={TOOL_CHOICE_OPTIONS} clearable />
      <EnumRow h={h} field="responseFormat" label="Response format (optional)" options={RESPONSE_FORMAT_OPTIONS} />
      <StringRow h={h} field="stop" label="Stop sequence (optional)" />
    </div>
  );
};
