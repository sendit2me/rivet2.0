import type { ChatV2Provider } from './chatV2Types.js';
import type { LLMChatV2NodeData } from './llmChatV2NodeData.js';
import {
  anthropicEffortOptions,
  chatV2ProviderOptions,
  getChatV2ProviderLabel,
  googleThinkingLevelOptions,
  openAIReasoningEffortOptions,
} from './providerOptions.js';

/**
 * The headline model-config fields the Summary Card shows for an LLM Chat node — the resolved
 * ("what runs") value of each, with a light inherited/overridden marker and how to edit it. Pure and
 * **node-agnostic** (it works on any `LLMChatV2NodeData`-shaped data + the resolved effective data),
 * so it lifts onto a shared chat-v2 editor surface later (Chat Loop re-impl). Feature 009.
 */

export type SummaryControl = 'string' | 'number' | 'enum' | 'readonly';

export interface ModelConfigSummaryField {
  /** Stable id of the headline field. */
  key: 'provider' | 'model' | 'reasoning' | 'temperature' | 'maxTokens' | 'extraBody';
  label: string;
  /** Human-readable resolved value (for display). */
  value: string;
  /** The raw effective value, for the inline control. */
  rawValue: unknown;
  /** The node-data field an inline edit / revert writes (absent for non-editable rows). */
  dataKey?: keyof LLMChatV2NodeData;
  /** `true` when the node's own value wins (and a revert-to-inherited is offered). */
  overridden: boolean;
  /** `false` rows are display-only (e.g. provider when a source drives it; the extraBody summary). */
  editable: boolean;
  control: SummaryControl;
  /** Options for an `enum` control. */
  options?: ReadonlyArray<{ value: string; label: string }>;
}

type EffortField = 'openAIReasoningEffort' | 'anthropicEffort' | 'googleThinkingLevel';

/** The provider's reasoning-effort node field + its options, or null for providers without one (custom). */
function reasoningFieldFor(
  provider: ChatV2Provider,
): { field: EffortField; options: ReadonlyArray<{ value: string; label: string }> } | null {
  switch (provider) {
    case 'openai':
      return { field: 'openAIReasoningEffort', options: openAIReasoningEffortOptions };
    case 'anthropic':
      return { field: 'anthropicEffort', options: anthropicEffortOptions };
    case 'google':
      return { field: 'googleThinkingLevel', options: googleThinkingLevelOptions };
    case 'custom':
      return null;
  }
}

function optionLabel(options: ReadonlyArray<{ value: string; label: string }>, value: unknown): string {
  return options.find((o) => o.value === (value ?? ''))?.label ?? String(value ?? '');
}

/** A compact summary of a raw `extraProviderOptions` JSON string — its top-level keys, or '(none)'. */
function extraBodySummary(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return '(none)';
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed as Record<string, unknown>);
      return keys.length > 0 ? keys.join(', ') : '(empty)';
    }
  } catch {
    /* fall through */
  }
  return '(custom)';
}

/**
 * Derive the headline summary fields for an LLM Chat node from its resolved `effective` data plus the
 * node's own `data` and the node `defaults` (for the differs-from-default override marker).
 *
 * - `overridden` = the node's own value wins: `data[field] !== defaults[field]`. `provider` is the
 *   exception — it is Profile-owned, so it is overridden only when **no connection source** is bound
 *   (`hasConnectionSource === false`) and the node changed it; when a Profile/Preset drives it the row
 *   is inherited and display-only ("set by Profile").
 * - `editable`: model / temperature / reasoning (when the provider has an effort field) / maxTokens;
 *   provider only when no source is bound; the extraBody summary is always display-only.
 */
export function deriveModelConfigSummary(
  effective: LLMChatV2NodeData,
  data: LLMChatV2NodeData,
  defaults: LLMChatV2NodeData,
  hasConnectionSource: boolean,
): ModelConfigSummaryField[] {
  const fields: ModelConfigSummaryField[] = [];

  // provider — Profile-owned.
  fields.push({
    key: 'provider',
    label: 'Provider',
    value: getChatV2ProviderLabel(effective.provider),
    rawValue: effective.provider,
    dataKey: 'provider',
    overridden: !hasConnectionSource && data.provider !== defaults.provider,
    editable: !hasConnectionSource,
    control: 'enum',
    options: chatV2ProviderOptions as ReadonlyArray<{ value: string; label: string }>,
  });

  // model.
  fields.push({
    key: 'model',
    label: 'Model',
    value: effective.model || '(none)',
    rawValue: effective.model,
    dataKey: 'model',
    overridden: data.model !== defaults.model,
    editable: true,
    control: 'string',
  });

  // reasoning — the resolved provider's effort field (custom has none).
  const reasoning = reasoningFieldFor(effective.provider);
  if (reasoning) {
    fields.push({
      key: 'reasoning',
      label: 'Reasoning',
      value: optionLabel(reasoning.options, effective[reasoning.field]),
      rawValue: effective[reasoning.field],
      dataKey: reasoning.field,
      overridden: data[reasoning.field] !== defaults[reasoning.field],
      editable: true,
      control: 'enum',
      options: reasoning.options,
    });
  } else {
    fields.push({
      key: 'reasoning',
      label: 'Reasoning',
      value: '—',
      rawValue: undefined,
      overridden: false,
      editable: false,
      control: 'readonly',
    });
  }

  // temperature.
  fields.push({
    key: 'temperature',
    label: 'Temperature',
    value: String(effective.temperature),
    rawValue: effective.temperature,
    dataKey: 'temperature',
    overridden: data.temperature !== defaults.temperature,
    editable: true,
    control: 'number',
  });

  // maxTokens.
  fields.push({
    key: 'maxTokens',
    label: 'Max tokens',
    value: String(effective.maxTokens),
    rawValue: effective.maxTokens,
    dataKey: 'maxTokens',
    overridden: data.maxTokens !== defaults.maxTokens,
    editable: true,
    control: 'number',
  });

  // extraBody — custom-provider only; a display-only summary of the resolved raw body params.
  if (effective.provider === 'custom') {
    fields.push({
      key: 'extraBody',
      label: 'Extra body',
      value: extraBodySummary(effective.extraProviderOptions),
      rawValue: effective.extraProviderOptions,
      overridden: data.extraProviderOptions !== defaults.extraProviderOptions,
      editable: false,
      control: 'readonly',
    });
  }

  return fields;
}
