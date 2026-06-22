import { deepMerge } from '../../utils/deepMerge.js';
import type {
  LlmPreset,
  LlmPresetOverrides,
  LlmProfile,
  LlmReasoningLevel,
  LlmSkill,
  ModelConfig,
  ProviderSkillBlock,
  SkillBase,
  SkillKind,
} from '../Settings.js';
import type { ChatV2Provider } from './chatV2Types.js';
import {
  type ChatV2LayerConfig,
  type CompleteEffectiveLLMChatV2Data,
  type EffectiveLLMChatV2Data,
  type LLMChatV2NodeData,
} from './llmChatV2NodeData.js';

/** The Preset / Profile / Skill selectors a chat-v2 node carries (added to the node data in 008b). */
export interface NodeModelSelectors {
  llmPresetId?: string;
  llmProfileId?: string;
  llmSkillId?: string;
}

/** Maximum `extends` chain depth before walking stops and a warning is traced. */
export const MAX_MODEL_CONFIG_EXTENDS_DEPTH = 10;

/** A Skill's signature; an absent `kind` is the chat signature (`text-to-text`). Single source of truth. */
export function getSkillKind(skill: { kind?: SkillKind }): SkillKind {
  return skill.kind ?? 'text-to-text';
}

/**
 * The model-config fields the LAYER owns (R2 overlap-deletion). When a config is bound these come ONLY
 * from Profile/Skill/Preset; the node's own values are **not read**. Everything NOT here is node-owned
 * (the complement — bindings, per-call inputs, and the Q6 structural/output-contract fields like
 * `responseFormat`, tools, output toggles) and survives verbatim. `satisfies` keeps the list exhaustive
 * against the real field type: a newly added field defaults to node-owned, never silently vanishes.
 */
export const LAYER_OWNED_MODEL_CONFIG_FIELDS = [
  // connection (Profile)
  'provider',
  'baseURL',
  'customProviderBaseURL',
  'apiKeySource',
  'customProviderApiKeyEnvVarName',
  'headers',
  // model + sampling/format params (Skill base) — NB: responseFormat is NODE-owned (Q6), absent here
  'model',
  'temperature',
  'maxTokens',
  'topP',
  'topK',
  'presencePenalty',
  'frequencyPenalty',
  'stopSequences',
  'seed',
  // reasoning + per-provider feature fields (Skill provider block)
  'openAIReasoningEffort',
  'openAIReasoningSummary',
  'enableOpenAIWebSearch',
  'openAIWebSearchContextSize',
  'enableOpenAICodeInterpreter',
  'anthropicThinkingMode',
  'anthropicThinkingBudget',
  'anthropicEffort',
  'anthropicCacheControlTtl',
  'googleThinkingBudget',
  'googleThinkingLevel',
  'googleIncludeThoughts',
  'enableGoogleSearchGrounding',
  'enableGoogleUrlContext',
  // raw body escape hatch (custom)
  'extraProviderOptions',
] as const satisfies readonly (keyof ChatV2LayerConfig)[];

/** Compile-time `never` assertion helper. */
type AssertNever<T extends never> = T;
/**
 * **`LAYER_OWNED` completeness, compiler-enforced:** every `ChatV2LayerConfig` key is listed above (the
 * `satisfies` above checks the converse — every listed key is a layer field). Together they make the list
 * bidirectionally exact: a new layer field can't be added without appearing here. (Disjointness of the
 * node vs layer types is asserted at `_AssertNodeLayerDisjoint` in llmChatV2NodeData.)
 */
export type _AssertLayerOwnedComplete = AssertNever<
  Exclude<keyof ChatV2LayerConfig, (typeof LAYER_OWNED_MODEL_CONFIG_FIELDS)[number]>
>;


/**
 * The completeness verdict. On `complete: true` it carries the **narrowed** effective config
 * ({@link CompleteEffectiveLLMChatV2Data} — provider + model guaranteed); this is the **sole** producer
 * of that type, so the runtime (typed `Complete`) can only be fed from a passed gate. The narrowing is
 * co-located with the checks below (the single `as`), so it can't desync from the predicate.
 */
export type LLMChatV2Completeness =
  | { complete: true; effective: CompleteEffectiveLLMChatV2Data }
  | { complete: false; reason: string };

/**
 * A bound node is runnable only when the resolved (layer-only) config yields a complete config: a
 * **connection** (provider, plus a base URL for the custom provider) AND a **model**. With nothing
 * bound the overlay is empty → no provider → incomplete. Drives the process() throw and the editor's
 * incomplete state — config-less by construction, never a silent gpt-5 default.
 */
export function assessLLMChatV2Completeness(effective: EffectiveLLMChatV2Data): LLMChatV2Completeness {
  const provider = effective.provider;
  if (!provider) {
    return { complete: false, reason: 'bind a Profile + Skill (or a Preset) — needs a connection and a model' };
  }
  if (provider === 'custom' && !effective.customProviderBaseURL) {
    return { complete: false, reason: 'the bound custom-provider connection needs a base URL' };
  }
  if (!effective.model) {
    return { complete: false, reason: 'the binding has a connection but no model — bind a Skill (or a Preset with one)' };
  }
  // provider + model proven present → the single, co-located narrowing to the Complete type.
  return { complete: true, effective: effective as CompleteEffectiveLLMChatV2Data };
}

/** The flattened Profile after its `extends` chain is merged (child wins; headers merge by key). */
type ResolvedProfile = LlmProfile;
/** The flattened Skill after its `extends` chain is merged (base child-wins; blocks deep-merge). */
interface ResolvedSkill {
  base: SkillBase;
  providers: Partial<Record<ChatV2Provider, ProviderSkillBlock>>;
}

type Trace = ((message: string) => void) | undefined;

/**
 * The pure model-config **pre-pass** for the chat-v2 (`llmChatV2`) node. Resolves a node's
 * Preset/Profile/Skill selectors against the project `modelConfig` into the node's **effective**
 * `LLMChatV2NodeData`, which the (untouched) `resolveLLMChatV2RuntimeConfig` then consumes.
 *
 * **R2 — config-less binding (overlap-deletion):** the **layer-owned** model-config fields
 * ({@link LAYER_OWNED_MODEL_CONFIG_FIELDS}) come ONLY from Profile/Skill/Preset; the node's own values
 * are **not read** (no node×config overlap → the gpt-5/default collision is gone by construction). The
 * **node-owned** complement (bindings, per-call inputs, Q6 structural/output-contract fields) survives
 * verbatim. Layer-unset optional params are **omitted** (the provider defaults them), not back-filled.
 *
 * **The byte-identical rail is RETIRED** (R0=A): the node carries no editable model-config, so an
 * unbound node resolves to an *incomplete* config (no provider/model) that `process()` refuses to run —
 * use {@link assessLLMChatV2Completeness}. There is no identity fast-path.
 *
 * Pure apart from the optional `onTrace` diagnostics callback (wired to `context.trace`).
 */
export function resolveEffectiveLLMChatV2Data(
  modelConfig: ModelConfig | undefined,
  selectors: NodeModelSelectors,
  nodeData: LLMChatV2NodeData,
  onTrace?: (message: string) => void,
): EffectiveLLMChatV2Data {
  const preset = resolvePresetEntity(modelConfig, selectors.llmPresetId, onTrace);
  // Node selector replaces the preset's piece; a blank node selector inherits the preset's.
  const profileId = selectors.llmProfileId || preset?.profileId;
  const skillId = selectors.llmSkillId || preset?.skillId;

  const profile = resolveProfileChain(modelConfig, profileId, onTrace);
  const skill = resolveSkillChain(modelConfig, skillId, onTrace);
  const overrides = preset?.overrides;

  // Provider is Profile-owned (layer): no Profile → no provider → the node resolves incomplete.
  const provider = profile?.provider;

  const overlay = buildOverlay(provider, profile, skill, overrides);
  const effective = applyOverlay(nodeData, overlay);

  // Connection headers + custom extraBody are layer-only (R2): the node's own no longer contribute.
  applyHeadersMerge(effective, profile, overrides);

  // Escape hatch (D9): custom-provider only. The custom extraBody comes from the layer
  // (Preset.overrides > providers.custom > base); the node's own raw extraProviderOptions is ignored.
  if (provider === 'custom') {
    applyExtraBodyEscapeHatch(effective, skill, overrides);
  } else {
    effective.extraProviderOptions = ''; // custom-only hatch → clear the node's for other providers
  }

  return effective;
}

// --- Entity resolution (with extends chains) -------------------------------------------------

function resolvePresetEntity(modelConfig: ModelConfig | undefined, id: string | undefined, onTrace: Trace): LlmPreset | undefined {
  if (!id) {
    return undefined;
  }
  const preset = (modelConfig?.presets ?? []).find((p) => p.id === id);
  if (!preset) {
    onTrace?.(`LLM preset '${id}' not found; ignoring`);
    return undefined;
  }
  return preset;
}

/** Walk an `extends` chain from `rootId`, child-first, cycle-guarded and depth-capped. */
function collectChain<T extends { id: string; extends?: string }>(
  byId: Map<string, T>,
  rootId: string,
  kind: string,
  onTrace: Trace,
): T[] {
  const chain: T[] = [];
  const visited = new Set<string>();
  let current: T | undefined = byId.get(rootId);

  while (current) {
    if (visited.has(current.id)) {
      onTrace?.(`LLM ${kind} '${rootId}' has an extends cycle at '${current.id}'; stopping and using the partial chain`);
      break;
    }
    visited.add(current.id);
    chain.push(current);

    if (chain.length > MAX_MODEL_CONFIG_EXTENDS_DEPTH) {
      onTrace?.(`LLM ${kind} '${rootId}' exceeds the max extends depth of ${MAX_MODEL_CONFIG_EXTENDS_DEPTH}; stopping`);
      break;
    }
    if (current.extends == null) {
      break;
    }
    const parent: T | undefined = byId.get(current.extends);
    if (!parent) {
      onTrace?.(`LLM ${kind} '${current.id}' extends unknown ${kind} '${current.extends}'; ignoring the missing parent`);
      break;
    }
    current = parent;
  }

  return chain;
}

function resolveProfileChain(modelConfig: ModelConfig | undefined, id: string | undefined, onTrace: Trace): ResolvedProfile | undefined {
  if (!id) {
    return undefined;
  }
  const byId = new Map((modelConfig?.profiles ?? []).map((p) => [p.id, p]));
  if (!byId.has(id)) {
    onTrace?.(`LLM profile '${id}' not found; ignoring`);
    return undefined;
  }

  const chain = collectChain(byId, id, 'profile', onTrace);
  // Merge ancestor → child so the more-derived profile wins.
  const resolved: Partial<LlmProfile> = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    mergeProfileInto(resolved, chain[i]!);
  }
  return resolved as ResolvedProfile;
}

function mergeProfileInto(target: Partial<LlmProfile>, profile: LlmProfile): void {
  if (profile.provider !== undefined) target.provider = profile.provider;
  if (profile.baseURL !== undefined) target.baseURL = profile.baseURL;
  if (profile.customProviderBaseURL !== undefined) target.customProviderBaseURL = profile.customProviderBaseURL;
  if (profile.apiKeySource !== undefined) target.apiKeySource = profile.apiKeySource;
  if (profile.customProviderApiKeyEnvVarName !== undefined)
    target.customProviderApiKeyEnvVarName = profile.customProviderApiKeyEnvVarName;
  if (profile.headers !== undefined) target.headers = { ...target.headers, ...profile.headers };
}

function resolveSkillChain(modelConfig: ModelConfig | undefined, id: string | undefined, onTrace: Trace): ResolvedSkill | undefined {
  if (!id) {
    return undefined;
  }
  const byId = new Map((modelConfig?.skills ?? []).map((s) => [s.id, s]));
  if (!byId.has(id)) {
    onTrace?.(`LLM skill '${id}' not found; ignoring`);
    return undefined;
  }
  // Kind guard — the chat resolver consumes ONLY text-to-text skills, however the id arrived (dropdown
  // OR the input-driven `llmSkillId` port, which can supply a cross-kind id at runtime and bypass the
  // editor filters). R2 closes the R1 residual: guard the WHOLE `extends` chain, not just the head —
  // `flattenSkillChain` merges kind-blind, so a chat→image chain would otherwise leak the image
  // parent's provider-block model. Any non-text-to-text link rejects the whole binding (→ incomplete).
  const chain = collectChain(byId, id, 'skill', onTrace);
  const offender = chain.find((s) => getSkillKind(s) !== 'text-to-text');
  if (offender) {
    onTrace?.(
      `LLM skill chain '${id}' includes a '${offender.kind}' link '${offender.id}', not text-to-text; ignoring on a chat node`,
    );
    return undefined;
  }
  const resolved: ResolvedSkill = { base: {}, providers: {} };
  for (let i = chain.length - 1; i >= 0; i--) {
    mergeSkillInto(resolved, chain[i]!);
  }
  return resolved;
}

/**
 * Flatten a Skill's `extends` chain (ancestor → child) into its composed `base` + per-provider blocks,
 * via the **kind-agnostic** per-key merge (`mergeSkillInto`). No kind guard here — exported so the
 * forcing fixture can prove an `ImageSkill` composes its width/height base + model provider block
 * exactly as a chat skill does (the merge never assumed chat fields).
 */
export function flattenSkillChain(byId: Map<string, LlmSkill>, id: string, onTrace?: Trace): ResolvedSkill {
  const chain = collectChain(byId, id, 'skill', onTrace);
  const resolved: ResolvedSkill = { base: {}, providers: {} };
  for (let i = chain.length - 1; i >= 0; i--) {
    mergeSkillInto(resolved, chain[i]!);
  }
  return resolved;
}

function mergeSkillInto(target: ResolvedSkill, skill: LlmSkill): void {
  if (skill.base) {
    const { extraBody, ...rest } = skill.base;
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) {
        (target.base as Record<string, unknown>)[key] = value;
      }
    }
    if (extraBody !== undefined) {
      target.base.extraBody = deepMerge(target.base.extraBody ?? {}, extraBody);
    }
  }
  for (const [provider, block] of Object.entries(skill.providers ?? {})) {
    if (!block) {
      continue;
    }
    const existing = target.providers[provider as ChatV2Provider] ?? {};
    const { extraBody, ...rest } = block;
    const merged: ProviderSkillBlock = { ...existing };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    if (extraBody !== undefined) {
      merged.extraBody = deepMerge(existing.extraBody ?? {}, extraBody);
    }
    target.providers[provider as ChatV2Provider] = merged;
  }
}

// --- Overlay construction --------------------------------------------------------------------

/** Reasoning-level → the resolved provider's effort field (fallback; explicit provider-block wins). */
function mapReasoningLevel(level: LlmReasoningLevel, provider: ChatV2Provider): Partial<ChatV2LayerConfig> {
  if (!level) {
    return {};
  }
  switch (provider) {
    case 'openai':
      // openAIReasoningEffort accepts minimal | low | medium | high (+ none/xhigh, not produced here).
      return { openAIReasoningEffort: level };
    case 'google':
      // googleThinkingLevel accepts minimal | low | medium | high.
      return { googleThinkingLevel: level };
    case 'anthropic':
      // anthropicEffort has no `minimal` — leave unset (provider block can set an exact value).
      return level === 'minimal' ? {} : { anthropicEffort: level };
    case 'custom':
      // No effort field on the custom provider.
      return {};
  }
}

/**
 * Copy defined keys from `src` into `target`, skipping `provider` (Profile-owned), `extraBody`
 * (escape hatch), and `headers` (per-key merge) — all three are special-cased outside the overlay.
 */
function assignDefined(target: Partial<ChatV2LayerConfig>, src: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(src)) {
    if (value === undefined || key === 'provider' || key === 'extraBody' || key === 'headers') {
      continue;
    }
    (target as Record<string, unknown>)[key] = value;
  }
}

function recordToHeaderArray(headers: Record<string, string>): { key: string; value: string }[] {
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

function headerArrayToRecord(headers: { key: string; value: string }[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of headers ?? []) {
    if (key.trim() !== '') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Per-key header merge across the connection layers — Profile base < Preset.overrides < Node, the
 * later layer winning per key (mirrors how `extraBody` is special-cased). So a node that adds one
 * header no longer drops the Profile's connection headers (the replace-vs-merge fix). Rail-safe: only
 * engages when a Profile or a Preset override actually contributes headers (a selector is set); with
 * neither, `effective.headers` is left as the node's own.
 */
function applyHeadersMerge(
  effective: EffectiveLLMChatV2Data,
  profile: ResolvedProfile | undefined,
  overrides: LlmPresetOverrides | undefined,
): void {
  // R2: layer-only — connection headers come from Profile < Preset.overrides; the node's own are
  // ignored. Always set (clears any node headers): `[]` when the layer supplies none.
  const profileHeaders = profile?.headers;
  const overrideHeaders = overrides?.headers ? headerArrayToRecord(overrides.headers) : undefined;
  effective.headers = recordToHeaderArray({ ...profileHeaders, ...overrideHeaders });
}

/**
 * Build the overlay (a `Partial<LLMChatV2NodeData>`) in precedence order — Profile → Skill.base →
 * Skill.providers[provider] → Preset.overrides — later layers winning per key. `extraBody` and
 * `provider` are handled outside the overlay (escape hatch / Profile-owned).
 */
function buildOverlay(
  provider: ChatV2Provider | undefined,
  profile: ResolvedProfile | undefined,
  skill: ResolvedSkill | undefined,
  overrides: LlmPresetOverrides | undefined,
): Partial<ChatV2LayerConfig> {
  const overlay: Partial<ChatV2LayerConfig> = {};

  // Provider is Profile-owned; it flows through the overlay like any other layer field (undefined → no
  // Profile → the node resolves incomplete).
  if (provider !== undefined) {
    overlay.provider = provider;
  }

  // Profile — connection only (no model: R1 moved the model to the Skill).
  if (profile) {
    if (profile.baseURL !== undefined) overlay.baseURL = profile.baseURL;
    if (profile.customProviderBaseURL !== undefined) overlay.customProviderBaseURL = profile.customProviderBaseURL;
    if (profile.apiKeySource !== undefined) overlay.apiKeySource = profile.apiKeySource;
    if (profile.customProviderApiKeyEnvVarName !== undefined)
      overlay.customProviderApiKeyEnvVarName = profile.customProviderApiKeyEnvVarName;
    // `headers` is NOT placed in the overlay — it is per-key merged in applyHeadersMerge (so a node
    // header no longer drops the profile's connection headers). Provider/extraBody are likewise special.
  }

  // Skill.base — agnostic params + coarse reasoning mapping (mapped only once a provider is resolved).
  if (skill?.base) {
    assignDefined(overlay, skill.base);
    if (provider && skill.base.reasoningLevel) {
      Object.assign(overlay, mapReasoningLevel(skill.base.reasoningLevel, provider));
    }
  }

  // Skill.providers[provider] — provider-specific; the **model** lives here (R1).
  const block = provider ? skill?.providers?.[provider] : undefined;
  if (block) {
    assignDefined(overlay, block);
  }

  // Preset overrides — highest below the node.
  if (overrides) {
    assignDefined(overlay, overrides as Record<string, unknown>);
  }

  return overlay;
}

/**
 * R2 **overlap-deletion**: build the effective config with no node×config overlap.
 * - **Node-owned** fields (the COMPLEMENT of {@link LAYER_OWNED_MODEL_CONFIG_FIELDS}) survive verbatim
 *   from the node — bindings, per-call inputs, the Q6 structural/output-contract fields. Defining
 *   node-owned as the complement (not an allowlist) means a newly added field defaults to node-owned
 *   and can never silently vanish.
 * - **Layer-owned** fields come ONLY from the overlay: the layer's value, or `undefined` when the layer
 *   left it unset — which the AI-SDK bridge omits (provider-defaulted), NOT back-filled from the node.
 *
 * No `createLLMChatV2NodeData()` defaults, no differs-from-default — the place the gpt-5/default
 * collision lived is gone. Returns a fresh object; never mutates the input. (`headers` / `extraProvider
 * Options` are cleared here and re-set by their layer-only merges in the caller.)
 */
function applyOverlay(nodeData: LLMChatV2NodeData, overlay: Partial<ChatV2LayerConfig>): EffectiveLLMChatV2Data {
  // The disjoint merge (the type-split): node-owned from the node, layer config from the overlay. The
  // two key sets share nothing (compiler-enforced — see `_AssertNodeLayerDisjoint`), so layer fields can
  // only flow INTO `effective`, never overwrite node state. Scoped to LAYER_OWNED rather than a blanket
  // `{...overlay}` spread: `buildOverlay`'s `assignDefined` can carry a SkillBase's node-owned key (e.g.
  // `responseFormat`) into the overlay, and that must NOT cross into effective (it stays node-owned) —
  // copying only LAYER_OWNED preserves R2's exact composition. A layer field the overlay left unset is
  // absent → read as `undefined` (AI-SDK-omitted), exactly as the old explicit `= undefined` produced.
  // `headers` + `extraProviderOptions` are set on `effective` next by their dedicated merges in the caller.
  const effective = { ...nodeData } as Record<string, unknown>;
  for (const field of LAYER_OWNED_MODEL_CONFIG_FIELDS) {
    if (field === 'headers' || field === 'extraProviderOptions') {
      continue;
    }
    effective[field] = (overlay as Record<string, unknown>)[field];
  }
  return effective as EffectiveLLMChatV2Data;
}

// --- Escape hatch (custom-provider raw body) -------------------------------------------------

/** Deterministic, recursively key-sorted JSON — keeps the editor cache key stable across re-resolves. */
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Merge the model-config `extraBody` contributions (base → providers.custom → Preset.overrides) and,
 * when there is any contribution, fold the node's own raw `extraProviderOptions` on top (node wins
 * per key) and write the stable-key-order serialization back to `effective.extraProviderOptions`.
 * Custom-provider only; leaves the node's raw string untouched when model-config contributes nothing.
 */
function applyExtraBodyEscapeHatch(
  effective: EffectiveLLMChatV2Data,
  skill: ResolvedSkill | undefined,
  overrides: LlmPresetOverrides | undefined,
): void {
  // R2: layer-only — the custom raw body comes from the layer (base → providers.custom → overrides);
  // the node's own raw extraProviderOptions is ignored. Always set (clears the node's): `''` when none.
  const contributed = deepMerge(
    deepMerge(skill?.base?.extraBody ?? {}, skill?.providers?.custom?.extraBody ?? {}),
    overrides?.extraBody ?? {},
  );
  effective.extraProviderOptions = Object.keys(contributed).length > 0 ? stableStringify(contributed) : '';
}
