import type { ChatV2Provider } from './chat-v2/chatV2Types.js';
import type { LLMChatV2ApiKeySource, LLMChatV2NodeData } from './chat-v2/llmChatV2NodeData.js';

/**
 * Coarse, provider-agnostic reasoning effort carried on a Skill's {@link SkillBase}. The resolution
 * maps it to the resolved provider's effort field as a **fallback** (openai/google take all four;
 * anthropic has no `minimal`, so `minimal` is left unset there). An explicit provider-block effort
 * value always wins. See `resolveEffectiveLLMChatV2Data`.
 */
export type LlmReasoningLevel = '' | 'minimal' | 'low' | 'medium' | 'high';

/**
 * A reusable, named **connection** bundle (the model-config "connection" axis), re-targeted onto
 * chat-v2 (DECISIONS D8). A Profile owns transport only — *which vendor surface*, where, with what
 * credentials. It is **signature-agnostic** (one connection serves text→text, text→image, … on its
 * provider), so it carries **no model** — the model is Skill-owned (R1; a connection shouldn't name a
 * model).
 */
export interface LlmProfile {
  /** Stable unique id, referenced by nodes via `llmProfileId`. */
  id: string;
  /** Human label (for UI / presets). */
  name: string;
  /** Optional parent profile id to inherit from (single-axis inheritance; cycle-guarded). */
  extends?: string;

  /** Which vendor surface this connection targets. chat-v2 is provider-aware (DECISIONS D6). */
  provider: ChatV2Provider;
  /** Hosted-provider base URL override (openai / anthropic / google). */
  baseURL?: string;
  /** Custom OpenAI-compatible provider base URL (used when `provider === 'custom'`). */
  customProviderBaseURL?: string;
  /** Where the API key comes from: an environment variable (default) or a node input port. */
  apiKeySource?: LLMChatV2ApiKeySource;
  /** Env-var name holding the custom provider's API key (when `apiKeySource === 'environment'`). */
  customProviderApiKeyEnvVarName?: string;
  headers?: Record<string, string>;
}

/**
 * The provider-agnostic core of a {@link LlmSkill}: sampling / format params shared across vendors,
 * plus a coarse {@link LlmReasoningLevel} and the generic `extraBody` escape hatch. Type-locked to
 * the chat-v2 node shape via `Pick<LLMChatV2NodeData, …>` so it never drifts from the runtime fields.
 */
export type SkillBase = Partial<
  Pick<
    LLMChatV2NodeData,
    | 'temperature'
    | 'maxTokens'
    | 'topP'
    | 'topK'
    | 'presencePenalty'
    | 'frequencyPenalty'
    | 'stopSequences'
    | 'seed'
    | 'responseFormat'
  >
> & {
  /** Coarse reasoning effort, mapped to the resolved provider's effort field (see {@link LlmReasoningLevel}). */
  reasoningLevel?: LlmReasoningLevel;
  /** Generic per-request body params; applied (custom-provider only) via the `extraProviderOptions` escape hatch (D9). */
  extraBody?: Record<string, unknown>;
};

/**
 * A per-provider extension block on a {@link LlmSkill}: the provider-specific subset of the chat-v2
 * node fields (model, effort, provider toggles, …), type-locked via `Pick<LLMChatV2NodeData, …>` and
 * excluding the `use*Input` node-port machinery. A `Partial`, so a block sets only what it overrides.
 */
export type ProviderSkillBlock = Partial<
  Pick<
    LLMChatV2NodeData,
    | 'model'
    | 'openAIReasoningEffort'
    | 'openAIReasoningSummary'
    | 'enableOpenAIWebSearch'
    | 'openAIWebSearchContextSize'
    | 'enableOpenAICodeInterpreter'
    | 'anthropicThinkingMode'
    | 'anthropicThinkingBudget'
    | 'anthropicEffort'
    | 'anthropicCacheControlTtl'
    | 'googleThinkingBudget'
    | 'googleThinkingLevel'
    | 'googleIncludeThoughts'
    | 'enableGoogleSearchGrounding'
    | 'enableGoogleUrlContext'
  >
> & {
  /** Generic per-request body params for this provider (custom-only passthrough; D9). */
  extraBody?: Record<string, unknown>;
};

/**
 * The **signature** a Skill (and the nodes it can attach to) targets, expressed as input→output —
 * NOT a node role. `text-to-text` is the chat family (chat / summarize / classify / … all share its
 * skills); `text-to-image` is the first non-chat signature, present only as a forcing fixture in R1
 * (no node consumes it yet). Absent `kind` defaults to `text-to-text`. Extensible: a new modality is a
 * new signature + its own param schema, added in one place. Only `text-to-text` executes today.
 */
export type SkillKind = 'text-to-text' | 'text-to-image';

/**
 * The minimal **text→image** modality base — width/height tuning, standalone (NOT a `Pick` of any node;
 * no image node exists yet). It exists to force the Skill type to be signature-generic rather than
 * chat-shaped, and to exercise the base layer of the base⊕provider composition for a non-chat shape.
 * Deliberately minimal (no steps/guidance/sampler) — hold the boundary until a real image node lands.
 */
export interface ImageSkillBase {
  width?: number;
  height?: number;
  extraBody?: Record<string, unknown>;
}

/** The per-provider extension block for a `text-to-image` Skill — the model (exercises the provider layer). */
export interface ImageProviderBlock {
  model?: string;
  extraBody?: Record<string, unknown>;
}

/** Identity fields shared by every Skill kind. */
interface LlmSkillIdentity {
  /** Stable unique id, referenced by nodes via `llmSkillId`. */
  id: string;
  /** Human label (for UI / presets). */
  name: string;
  /** Optional parent skill id to inherit from (single-axis inheritance; cycle-guarded; same-kind only). */
  extends?: string;
}

/**
 * A **text→text (chat)** Skill — the `base` (provider-agnostic params) + per-provider `providers`
 * blocks fan-out (DECISIONS D7), now carrying the per-request **model** (R1: moved off the Profile).
 * Resolution applies `base`, then the resolved provider's block (which wins), then the node. The
 * `extends` chain resolves **before** the provider overlay (two orthogonal axes).
 */
export interface ChatSkill extends LlmSkillIdentity {
  /** The signature; absent = `text-to-text`. */
  kind?: 'text-to-text';
  /** Provider-agnostic params (sampling / format / coarse reasoning / extraBody). */
  base?: SkillBase;
  /** Per-provider extension blocks (incl. the model); only the resolved provider's block is applied. */
  providers?: Partial<Record<ChatV2Provider, ProviderSkillBlock>>;
}

/** A **text→image** Skill — the R1 forcing fixture's shape; no node executes it yet. */
export interface ImageSkill extends LlmSkillIdentity {
  kind: 'text-to-image';
  base?: ImageSkillBase;
  providers?: Partial<Record<ChatV2Provider, ImageProviderBlock>>;
}

/**
 * A reusable, named **behaviour + model** bundle (the "Skill" axis), **discriminated by signature
 * (`kind`)** so it is no longer chat-shaped by construction. Today only `ChatSkill` executes;
 * `ImageSkill` proves the type, storage, kind-filtering, and base⊕provider composition stay generic.
 */
export type LlmSkill = ChatSkill | ImageSkill;

/**
 * The fields a {@link LlmPreset} may override on top of its resolved Profile + Skill — a closed
 * `Partial` over the **effective chat-v2 config**, plus the object-valued `extraBody` (merged via the
 * escape hatch). Sits just below the node in precedence. Excludes the `use*Input` node-port
 * machinery, the Profile-owned `provider`, and the model-config selector ids themselves (a Preset
 * must never set `llm*Id` — that would pollute the effective data / recurse).
 */
export type LlmPresetOverrides = Partial<
  Omit<LLMChatV2NodeData, `use${string}Input` | 'provider' | 'llmPresetId' | 'llmProfileId' | 'llmSkillId'>
> & {
  extraBody?: Record<string, unknown>;
};

/**
 * A one-pick **composition** — the friendly "agent" entry. A Preset references a Profile (connection)
 * and an optional Skill (behaviour + model), plus an optional `overrides` layer, so a single node
 * selection applies all three. The engine stays orthogonal: a Preset *expands* to Profile + Skill.
 *
 * Precedence (SPEC 008 §4):
 * `Node > Preset.overrides > Skill.providers[provider] > Skill.base > Profile`.
 */
export interface LlmPreset {
  /** Stable unique id, referenced by nodes via `llmPresetId`. */
  id: string;
  /** Human label, e.g. "Coder (local Qwen)". */
  name: string;
  /** Required Profile (connection) this preset expands to. */
  profileId: string;
  /** Optional Skill (behaviour + model); omitted = No-Skill. */
  skillId?: string;
  /** Field overrides applied on top of the resolved profile + skill (highest below the node). */
  overrides?: LlmPresetOverrides;
}

export interface Settings<PluginSettings = Record<string, Record<string, unknown>>> {
  recordingPlaybackLatency?: number;

  /** Apply predefined colors to supported newly added node types in the editor UI. */
  defaultNodeColors?: boolean;

  /** Automatically open the node settings panel after creating a new node in the editor UI. */
  openNodeSettingsOnCreate?: boolean;

  /** Configurable settings that a plugin can get and set. Settings can be available in the settings modal and are stored  */
  pluginSettings?: PluginSettings;

  /** A plugin can request environment variables to configure itself. Those can be populated here. */
  pluginEnv?: {
    [key: string]: string | undefined;
  };

  // TODO move to openai plugin
  openAiKey?: string;
  openAiOrganization?: string;
  openAiEndpoint?: string;

  /** Timeout in milliseconds before retrying a chat node call. */
  chatNodeTimeout?: number;

  chatNodeHeaders?: Record<string, string>;

  throttleChatNode?: number;

  /**
   * The model-configuration layer (Profiles + Skills + Presets) used to resolve a node's
   * connection and behavior. The **same** shape lives on {@link Project} (embedded, travels with
   * the project) and here on `Settings` (the browser-local reusable library). At runtime the
   * processor resolves against `merge(project, global)` with the project winning by id, so a
   * headless/published/triggered run — which has no global `Settings` — works purely from the
   * project's embedded copy. See {@link ModelConfig} and `assembleModelConfig`.
   */
  modelConfig?: ModelConfig;
}

/**
 * The cohesive model-configuration object — Profiles (connection) + Skills (behavior) + Presets
 * (one-pick bundles) — that together resolve into one model configuration for a node. A single
 * findable representation, shared by {@link Settings} (the global library) and {@link Project}
 * (embedded, portable). All fields optional; an absent/empty object means "no model-config",
 * which resolves byte-identically to base rivet2.0.
 */
export interface ModelConfig {
  /** Reusable connection bundles selectable per node. See {@link LlmProfile}. */
  profiles?: LlmProfile[];

  /** Reusable behavior bundles selectable per node. See {@link LlmSkill}. */
  skills?: LlmSkill[];

  /** One-pick Profile+Skill+overrides bundles selectable per node. See {@link LlmPreset}. */
  presets?: LlmPreset[];
}
