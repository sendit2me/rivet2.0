import type { SkillKind } from '../Settings.js';
import type { ChatV2Provider } from './chatV2Types.js';
import {
  anthropicEffortOptions,
  getChatV2ProviderLabel,
  googleThinkingLevelOptions,
  openAIReasoningEffortOptions,
} from './providerOptions.js';

/**
 * The resolved-binding summary card's derivation (R4) — **schema-driven per kind**. A non-chat kind
 * renders without bespoke code: the mapper walks the kind's descriptor and calls each field's value
 * resolver; ALL per-kind logic lives in the descriptor entry, so adding a kind = adding an entry, never
 * editing the mapper. Read-only (R2 — editing is the R3 selectors/inline authoring). Pure, core-resident
 * (co-located with the chat formatters), keyed by `SkillKind` so the descriptor map is exhaustive.
 */

/** One display row of the resolved config. */
export interface SummaryRow {
  key: string;
  label: string;
  value: string;
}
/** An ordered group of rows; `label` renders a header (chat = one unlabeled group → flat). */
export interface SummaryGroup {
  label?: string;
  rows: SummaryRow[];
}

/** A field descriptor: a label + a value resolver over the resolved config (`undefined` → row skipped). */
interface FieldDesc {
  key: string;
  label: string;
  value: (resolved: Record<string, unknown>) => string | undefined;
}
interface GroupDesc {
  label?: string;
  fields: FieldDesc[];
}

type EffortField = 'openAIReasoningEffort' | 'anthropicEffort' | 'googleThinkingLevel';

/** The provider's reasoning-effort field + its options, or null for providers without one (custom). */
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

/** Show a number (incl. 0) as text; skip the row when unset (the layer left it → the provider defaults it). */
const num =
  (key: string) =>
  (r: Record<string, unknown>): string | undefined =>
    typeof r[key] === 'number' ? String(r[key]) : undefined;

// --- Reused field descriptors (provider/model are common to every kind so far) ---
const PROVIDER_FIELD: FieldDesc = {
  key: 'provider',
  label: 'Provider',
  value: (r) => getChatV2ProviderLabel(r.provider as ChatV2Provider),
};
const MODEL_FIELD: FieldDesc = {
  key: 'model',
  label: 'Model',
  value: (r) => (r.model as string) || '(none)',
};

/**
 * Per-kind summary descriptors. `Record<SkillKind, …>` makes this **exhaustive** at compile time: a new
 * `SkillKind` can't be added without a descriptor entry. `text-to-image` is the forcing fixture (the
 * card's analog of `ImageSkill`): a real second schema with no UI — proves the mapper is generic.
 */
const SUMMARY_DESCRIPTORS: Record<SkillKind, GroupDesc[]> = {
  // text-to-text (chat) — ONE unlabeled group → renders flat (reproduces the chat card row-for-row).
  'text-to-text': [
    {
      fields: [
        PROVIDER_FIELD,
        MODEL_FIELD,
        {
          key: 'reasoning',
          label: 'Reasoning',
          value: (r) => {
            const reasoning = reasoningFieldFor(r.provider as ChatV2Provider);
            return reasoning ? optionLabel(reasoning.options, r[reasoning.field]) : '—';
          },
        },
        { key: 'temperature', label: 'Temperature', value: num('temperature') },
        { key: 'maxTokens', label: 'Max tokens', value: num('maxTokens') },
        {
          key: 'extraBody',
          label: 'Extra body',
          value: (r) => (r.provider === 'custom' ? extraBodySummary(r.extraProviderOptions as string) : undefined),
        },
      ],
    },
  ],
  // text-to-image — the forcing fixture (provider/model + a labeled Dimensions group; no UI mounts it).
  'text-to-image': [
    { fields: [PROVIDER_FIELD, MODEL_FIELD] },
    { label: 'Dimensions', fields: [{ key: 'width', label: 'Width', value: num('width') }, { key: 'height', label: 'Height', value: num('height') }] },
  ],
};

/**
 * Derive the resolved-binding summary for a given `kind` — a generic mapper over the kind's descriptor.
 * Each caller supplies its own signature (the chat card passes `'text-to-text'`); the resolved config
 * itself carries no kind. Unset fields and empty groups are skipped.
 */
export function deriveModelConfigSummary(resolved: Record<string, unknown>, kind: SkillKind): SummaryGroup[] {
  return SUMMARY_DESCRIPTORS[kind]
    .map((group) => ({
      label: group.label,
      rows: group.fields
        .map((f) => ({ key: f.key, label: f.label, value: f.value(resolved) }))
        .filter((row): row is SummaryRow => row.value !== undefined),
    }))
    .filter((group) => group.rows.length > 0);
}
