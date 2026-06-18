/**
 * A reusable, named connection bundle (endpoint + credentials + headers + default model)
 * selectable per node via `ChatNodeConfigData.llmProfileId`.
 *
 * Profiles are the "connection" axis of the model-configuration layer. They are orthogonal
 * to Skills (behavior, Feature 002). Default-selection (which profile to use when a node
 * picks none) is intentionally NOT modeled here — that belongs to the Preset layer
 * (Feature 003). When no profile is selected, resolution falls back to the global settings
 * fields below, byte-identically to today.
 */
export interface LlmProfile {
  /** Stable unique id, referenced by nodes via `llmProfileId`. */
  id: string;
  /** Human label (for UI / presets). */
  name: string;
  /** Optional parent profile id to inherit from (single-axis inheritance; cycle-guarded). */
  extends?: string;

  endpoint?: string;
  apiKey?: string;
  organization?: string;
  headers?: Record<string, string>;
  /** Used when a node leaves its model field blank. */
  defaultModel?: string;
}

/**
 * A reusable, named *behavior* bundle (the "Skill" axis), composable onto any
 * {@link LlmProfile}. Where a Profile owns the connection, a Skill owns behavior: a
 * pre-prompt plus sampling / effort / format overrides. Default is No-Skill (passthrough),
 * which is byte-identical to base behavior.
 *
 * Pure behavior — **no selection metadata**. A Skill does not carry `isDefault` or a
 * `preferredProfileId`; default-selection and Profile×Skill bundling live at the Preset
 * layer (Feature 003). Each field is optional; an omitted field inherits the lower layer
 * (the node's value / its default). See SPEC 002 §4 for the precedence and "node-set" rule.
 */
export interface LlmSkill {
  /** Stable unique id, referenced by nodes via `llmSkillId`. */
  id: string;
  /** Human label (for UI / presets). */
  name: string;
  /** Optional parent skill id to inherit from (single-axis inheritance; cycle-guarded). */
  extends?: string;

  /** Prepended into the message array at run time as a system message (the "pre-prompt"). */
  systemPrompt?: string;

  // Behavior / sampling overrides (all optional; omitted = inherit the node's value/default).
  temperature?: number;
  top_p?: number;
  useTopP?: boolean;
  maxTokens?: number;
  reasoningEffort?: '' | 'low' | 'medium' | 'high';
  toolChoice?: 'none' | 'auto' | 'function';
  responseFormat?: '' | 'text' | 'json' | 'json_schema';
  stop?: string;
}

/**
 * Whitelisted fields a {@link LlmPreset} may override on top of its resolved Profile + Skill.
 * This is the **full union** of {@link LlmProfile}'s value fields (connection) and
 * {@link LlmSkill}'s value fields (behavior) — a Preset can tweak anything its profile or skill
 * carries — but it is *closed*: it deliberately excludes node machinery (`useModelInput`,
 * `cache`, the `use<Field>Input` toggles, …) so a Preset can never reach into node internals.
 */
export interface LlmPresetOverrides {
  // Connection (from LlmProfile)
  endpoint?: string;
  apiKey?: string;
  organization?: string;
  headers?: Record<string, string>;
  defaultModel?: string;

  // Behavior (from LlmSkill)
  systemPrompt?: string;
  temperature?: number;
  top_p?: number;
  useTopP?: boolean;
  maxTokens?: number;
  reasoningEffort?: '' | 'low' | 'medium' | 'high';
  toolChoice?: 'none' | 'auto' | 'function';
  responseFormat?: '' | 'text' | 'json' | 'json_schema';
  stop?: string;
}

/**
 * A one-pick **composition** — the friendly "local-Qwen-developer" entry. A Preset references a
 * Profile (connection) and an optional Skill (behavior), plus an optional whitelisted `overrides`
 * layer, so a single node selection applies both. The engine stays orthogonal: a Preset *expands*
 * to Profile + Skill; it is not a new axis.
 *
 * Precedence across the whole stack (SPEC 003 §3):
 * `Node-level field > Preset.overrides > Skill > Profile > Global`.
 *
 * `isDefault` is the home for default-selection (deliberately dropped from Profiles/Skills). A
 * default preset applies **only when a node selects nothing on any axis** (no preset/profile/skill);
 * with no `isDefault` preset defined, behavior is byte-identical to the no-Preset path.
 */
export interface LlmPreset {
  /** Stable unique id, referenced by nodes via `llmPresetId`. */
  id: string;
  /** Human label, e.g. "local-Qwen-developer". */
  name: string;
  /** Required Profile (connection) this preset expands to. */
  profileId: string;
  /** Optional Skill (behavior); omitted = No-Skill. */
  skillId?: string;
  /** Field overrides applied on top of the resolved profile + skill (highest below the node). */
  overrides?: LlmPresetOverrides;
  /** Marks the preset applied to a node that selects nothing. First wins if several are flagged. */
  isDefault?: boolean;
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

  /** Reusable connection bundles selectable per node. See {@link LlmProfile}. */
  llmProfiles?: LlmProfile[];

  /** Reusable behavior bundles selectable per node. See {@link LlmSkill}. */
  llmSkills?: LlmSkill[];

  /** One-pick Profile+Skill+overrides bundles selectable per node. See {@link LlmPreset}. */
  llmPresets?: LlmPreset[];
}
