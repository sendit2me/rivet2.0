import { type FC } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import Toggle from '@atlaskit/toggle';
import { type ChatV2Provider, type LlmSkill, type ProviderSkillBlock, type SkillBase } from '@valerypopoff/rivet2-core';
import { LlmSelectorField } from '../editors/LlmSelectorEditors.js';
import { modelConfigFormStyles } from './modelConfigFormStyles.js';
import { SkillBaseFields } from './modelConfigFields.js';
import { JsonObjectField } from './JsonObjectField.js';

/**
 * Presentational editor for one LLM **Skill** (the behaviour + model axis, chat-v2 fan-out shape).
 * Pure: `value` in, `onChange` out; no store access. A Skill is a generic {@link SkillBase} plus
 * per-provider {@link ProviderSkillBlock} extension blocks. Authoring here is functional-minimal
 * (008a): the base params + the per-provider model and `extraBody`. Richer provider-block fields
 * (effort, provider toggles) are deferred to the 009-era UX.
 */
const PROVIDERS: { value: ChatV2Provider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'custom', label: 'Custom provider' },
];

export const LlmSkillForm: FC<{
  value: LlmSkill;
  onChange: (next: LlmSkill) => void;
  /** All skills, for the Extends picker (self is filtered out). */
  skills: ReadonlyArray<LlmSkill>;
  isReadonly?: boolean;
}> = ({ value, onChange, skills, isReadonly = false }) => {
  const update = (patch: Partial<LlmSkill>) => onChange({ ...value, ...patch });
  const extendsSkills = skills.filter((s) => s.id !== value.id);

  const base = (value.base ?? {}) as Record<string, unknown>;
  const updateBase = (next: Record<string, unknown>) =>
    update({ base: Object.keys(next).length > 0 ? (next as SkillBase) : undefined });

  const providers = value.providers ?? {};
  const updateProviderBlock = (provider: ChatV2Provider, block: ProviderSkillBlock | undefined) => {
    const next: Partial<Record<ChatV2Provider, ProviderSkillBlock>> = { ...providers };
    if (block === undefined) {
      delete next[provider];
    } else {
      next[provider] = block;
    }
    update({ providers: Object.keys(next).length > 0 ? next : undefined });
  };

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

      <div className="model-config-form-subsection">
        <div className="model-config-form-subsection-title">Base (provider-agnostic)</div>
        <SkillBaseFields value={base} onChange={updateBase} isReadonly={isReadonly} />
        <JsonObjectField
          value={base.extraBody as Record<string, unknown> | undefined}
          label="Extra Body (JSON)"
          name="skill-extraBody"
          isReadonly={isReadonly}
          helperMessage='Generic per-request body params (custom provider only), e.g. { "chat_template_kwargs": { "enable_thinking": false } }.'
          onChange={(next) => {
            const nextBase = { ...base };
            if (next === undefined) {
              delete nextBase.extraBody;
            } else {
              nextBase.extraBody = next;
            }
            updateBase(nextBase);
          }}
        />
      </div>

      <div className="model-config-form-subsection">
        <div className="model-config-form-subsection-title">Per-provider blocks</div>
        <p className="model-config-form-subsection-help">
          Optional provider-specific overrides. Only the resolved provider&apos;s block is applied.
        </p>
        {PROVIDERS.map(({ value: provider, label }) => (
          <ProviderBlockEditor
            key={provider}
            label={label}
            block={providers[provider]}
            isReadonly={isReadonly}
            onChange={(block) => updateProviderBlock(provider, block)}
          />
        ))}
      </div>

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

/** One per-provider block: a presence toggle, then a model + extraBody when enabled (functional-minimal). */
const ProviderBlockEditor: FC<{
  label: string;
  block: ProviderSkillBlock | undefined;
  isReadonly: boolean;
  onChange: (block: ProviderSkillBlock | undefined) => void;
}> = ({ label, block, isReadonly, onChange }) => {
  const present = block !== undefined;
  const updateBlock = (patch: Partial<ProviderSkillBlock>) => {
    const next: ProviderSkillBlock = { ...(block ?? {}), ...patch };
    // Drop emptied keys so an all-empty block can collapse to undefined.
    for (const key of Object.keys(next) as (keyof ProviderSkillBlock)[]) {
      if (next[key] === undefined) {
        delete next[key];
      }
    }
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <Field name={`skill-provider-${label}`} label={label} isDisabled={isReadonly}>
      {() => (
        <>
          <div className="model-config-form-row-inline">
            <Toggle
              isChecked={present}
              isDisabled={isReadonly}
              label={`Configure ${label}`}
              onChange={(e) => onChange(e.target.checked ? (block ?? {}) : undefined)}
            />
            <span>Configure {label}</span>
          </div>
          {present && (
            <>
              <TextField
                value={(block?.model as string) ?? ''}
                placeholder="Model id"
                isReadOnly={isReadonly}
                onChange={(e) => {
                  const raw = (e.target as HTMLInputElement).value;
                  updateBlock({ model: raw.trim() === '' ? undefined : raw });
                }}
              />
              <JsonObjectField
                value={block?.extraBody}
                label="Extra Body (JSON)"
                name={`skill-provider-${label}-extraBody`}
                isReadonly={isReadonly}
                helperMessage="Provider-specific body params (custom provider only)."
                onChange={(next) => updateBlock({ extraBody: next })}
              />
            </>
          )}
        </>
      )}
    </Field>
  );
};
