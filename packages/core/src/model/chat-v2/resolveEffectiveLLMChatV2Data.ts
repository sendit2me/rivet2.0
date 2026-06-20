import { isEqual } from 'lodash-es';
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
} from '../Settings.js';
import type { ChatV2Provider } from './chatV2Types.js';
import { createLLMChatV2NodeData, type LLMChatV2NodeData } from './llmChatV2NodeData.js';

/** The Preset / Profile / Skill selectors a chat-v2 node carries (added to the node data in 008b). */
export interface NodeModelSelectors {
  llmPresetId?: string;
  llmProfileId?: string;
  llmSkillId?: string;
}

/** Maximum `extends` chain depth before walking stops and a warning is traced. */
export const MAX_MODEL_CONFIG_EXTENDS_DEPTH = 10;

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
 * Precedence (most-specific wins): `createLLMChatV2NodeData() defaults → Profile → Skill.base →
 * Skill.providers[resolvedProvider] → Preset.overrides → Node`. The node wins a field iff its value
 * **differs from its default** (the differs-from-default "node-set" rule); `provider` is the one
 * exception — it is **Profile-owned** and selects which provider block applies.
 *
 * **Byte-identical rail (sacred):** when no selector is set, the node data is returned **unchanged**
 * (identity — the overlay logic never runs). A selector that resolves to nothing (dangling / unknown
 * id) produces an empty overlay, so the result still deep-equals the input.
 *
 * Pure apart from the optional `onTrace` diagnostics callback (wired to `context.trace`).
 */
export function resolveEffectiveLLMChatV2Data(
  modelConfig: ModelConfig | undefined,
  selectors: NodeModelSelectors,
  nodeData: LLMChatV2NodeData,
  onTrace?: (message: string) => void,
): LLMChatV2NodeData {
  // SACRED byte-identical rail: no selectors → identity return. Never run overlay logic when unset.
  if (!selectors.llmPresetId && !selectors.llmProfileId && !selectors.llmSkillId) {
    return nodeData;
  }

  const preset = resolvePresetEntity(modelConfig, selectors.llmPresetId, onTrace);
  // Node selector replaces the preset's piece; a blank node selector inherits the preset's.
  const profileId = selectors.llmProfileId || preset?.profileId;
  const skillId = selectors.llmSkillId || preset?.skillId;

  const profile = resolveProfileChain(modelConfig, profileId, onTrace);
  const skill = resolveSkillChain(modelConfig, skillId, onTrace);
  const overrides = preset?.overrides;

  // `provider` is Profile-owned: a bound Profile's provider wins over the node; with no Profile the
  // node's own provider drives block selection.
  const provider: ChatV2Provider = profile?.provider ?? nodeData.provider;

  const overlay = buildOverlay(provider, profile, skill, overrides);
  const effective = applyOverlay(nodeData, overlay, provider);

  // Escape hatch (D9): custom-provider only. Merge model-config extraBody into the node's raw
  // `extraProviderOptions` (Node > Preset.overrides > providers.custom > base) with stable key order.
  if (provider === 'custom') {
    applyExtraBodyEscapeHatch(effective, nodeData, skill, overrides);
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
  if (profile.defaultModel !== undefined) target.defaultModel = profile.defaultModel;
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
function mapReasoningLevel(level: LlmReasoningLevel, provider: ChatV2Provider): Partial<LLMChatV2NodeData> {
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

/** Copy defined keys from `src` into `target`, skipping `provider` (Profile-owned) and `extraBody` (escape hatch). */
function assignDefined(target: Partial<LLMChatV2NodeData>, src: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(src)) {
    if (value === undefined || key === 'provider' || key === 'extraBody') {
      continue;
    }
    (target as Record<string, unknown>)[key] = value;
  }
}

function recordToHeaderArray(headers: Record<string, string>): { key: string; value: string }[] {
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

/**
 * Build the overlay (a `Partial<LLMChatV2NodeData>`) in precedence order — Profile → Skill.base →
 * Skill.providers[provider] → Preset.overrides — later layers winning per key. `extraBody` and
 * `provider` are handled outside the overlay (escape hatch / Profile-owned).
 */
function buildOverlay(
  provider: ChatV2Provider,
  profile: ResolvedProfile | undefined,
  skill: ResolvedSkill | undefined,
  overrides: LlmPresetOverrides | undefined,
): Partial<LLMChatV2NodeData> {
  const overlay: Partial<LLMChatV2NodeData> = {};

  // Profile — connection. `model` seeded from the fallback defaultModel (a provider block may override).
  if (profile) {
    if (profile.baseURL !== undefined) overlay.baseURL = profile.baseURL;
    if (profile.customProviderBaseURL !== undefined) overlay.customProviderBaseURL = profile.customProviderBaseURL;
    if (profile.apiKeySource !== undefined) overlay.apiKeySource = profile.apiKeySource;
    if (profile.customProviderApiKeyEnvVarName !== undefined)
      overlay.customProviderApiKeyEnvVarName = profile.customProviderApiKeyEnvVarName;
    if (profile.headers !== undefined) overlay.headers = recordToHeaderArray(profile.headers);
    if (profile.defaultModel !== undefined) overlay.model = profile.defaultModel;
  }

  // Skill.base — agnostic params + coarse reasoning mapping.
  if (skill?.base) {
    assignDefined(overlay, skill.base);
    if (skill.base.reasoningLevel) {
      Object.assign(overlay, mapReasoningLevel(skill.base.reasoningLevel, provider));
    }
  }

  // Skill.providers[provider] — provider-specific; `model` here wins over Profile.defaultModel.
  const block = skill?.providers?.[provider];
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
 * Fold the overlay onto the node data with the node winning per field iff it **differs from its
 * default** (Node > overlay > defaults). `provider` is set unconditionally from the resolved
 * provider (Profile-owned). Returns a fresh object; never mutates the input.
 */
function applyOverlay(
  nodeData: LLMChatV2NodeData,
  overlay: Partial<LLMChatV2NodeData>,
  provider: ChatV2Provider,
): LLMChatV2NodeData {
  const defaults = createLLMChatV2NodeData();
  const effective: LLMChatV2NodeData = { ...nodeData };

  for (const key of Object.keys(overlay) as (keyof LLMChatV2NodeData)[]) {
    if (key === 'provider') {
      continue; // Profile-owned; set below.
    }
    const overlayValue = overlay[key];
    if (overlayValue === undefined) {
      continue;
    }
    // Node wins only when it has been changed from its default; otherwise the overlay fills it.
    if (isEqual(nodeData[key], defaults[key])) {
      (effective as Record<string, unknown>)[key as string] = overlayValue;
    }
  }

  effective.provider = provider;
  return effective;
}

// --- Escape hatch (custom-provider raw body) -------------------------------------------------

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

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
  effective: LLMChatV2NodeData,
  nodeData: LLMChatV2NodeData,
  skill: ResolvedSkill | undefined,
  overrides: LlmPresetOverrides | undefined,
): void {
  const contributed = deepMerge(
    deepMerge(skill?.base?.extraBody ?? {}, skill?.providers?.custom?.extraBody ?? {}),
    overrides?.extraBody ?? {},
  );
  if (Object.keys(contributed).length === 0) {
    return; // No model-config extraBody → leave the node's own extraProviderOptions as-is.
  }
  const nodeExtra = parseJsonObject(nodeData.extraProviderOptions) ?? {};
  const merged = deepMerge(contributed, nodeExtra); // Node wins per key.
  effective.extraProviderOptions = stableStringify(merged);
}
