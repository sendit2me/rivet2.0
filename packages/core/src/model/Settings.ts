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
}
