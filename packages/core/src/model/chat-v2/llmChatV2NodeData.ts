import type { ChatV2ResponseFormat } from './chatV2ResponseFormat.js';
import { createChatV2CommonNodeData, type ChatV2CommonNodeData } from './chatV2Shared.js';
import {
  DEFAULT_LLM_CHAT_V2_RETRY_ON_NON_200_COOLDOWN_MS,
  DEFAULT_LLM_CHAT_V2_RETRY_ON_NON_200_REPEAT_TIMES,
} from './chatV2Retry.js';
import type { ChatV2Provider } from './chatV2Types.js';
import type { ChartNode, NodeId } from '../NodeBase.js';

export type LLMChatV2ToolChoiceMode = '' | 'auto' | 'function' | 'required';
export type LLMChatV2ApiKeySource = 'environment' | 'input';

/**
 * **Node-owned** LLM Chat config — what's persisted on and read off the node. The layer-owned model
 * config (provider / model / params / reasoning / connection / extraBody) is NOT here: it lives on
 * {@link ChatV2LayerConfig} and is supplied by the resolved Profile/Skill/Preset (the type-split
 * structurally prevents the node from carrying a layer field again — see the disjointness assertion).
 * This is: the selector bindings + their input toggles, the per-call fields, the (vestigial — see
 * {@link ChatV2CommonNodeData}) drive-from-input toggles, and the Q6 structural / output-contract fields.
 */
export type LLMChatV2NodeConfigData = ChatV2CommonNodeData & {
  // node's drive-from-input toggles for layer-owned values (the values themselves are layer-owned)
  useCustomProviderBaseURLInput: boolean;
  useBaseURLInput: boolean;
  useHeadersInput: boolean;
  useExtraProviderOptionsInput: boolean;
  useAnthropicThinkingBudgetInput: boolean;
  useGoogleThinkingBudgetInput: boolean;
  // per-call (a live input port survives the per-param filter)
  openAIPreviousResponseId: string;
  useOpenAIPreviousResponseIdInput: boolean;
  // Q6 — response format (node-owned structural)
  responseFormat?: ChatV2ResponseFormat;
  responseSchemaName?: string;
  useResponseSchemaNameInput?: boolean;
  responseSchemaDescription?: string;
  useResponseSchemaDescriptionInput?: boolean;
  // Q6 — tools
  toolChoice?: LLMChatV2ToolChoiceMode;
  toolChoiceFunction?: string;
  parallelToolCalls?: boolean;
  autoContinueToolCalls?: boolean;
  maxToolRounds?: number;
  // Q6 — technical
  retryOnNon200?: boolean;
  retryOnNon200RepeatTimes?: number;
  retryOnNon200CooldownMs?: number;
  outputRequestStatus?: boolean;

  // Model-config selectors (Feature 008): a selected Preset/Profile/Skill resolves into the effective
  // config. Unset → the binding is incomplete and the node won't run (the rail is retired, R0=A).
  llmPresetId?: string;
  llmProfileId?: string;
  llmSkillId?: string;

  // Drive a selector's id from an input port instead of the editor dropdown (input-driven selectors).
  useLlmPresetIdInput?: boolean;
  useLlmProfileIdInput?: boolean;
  useLlmSkillIdInput?: boolean;
};

export type LLMChatV2NodeData = LLMChatV2NodeConfigData;
export type LLMChatV2Node = ChartNode<'llmChatV2', LLMChatV2NodeData>;

/**
 * **Layer-owned** model config — the resolved Profile/Skill/Preset's contribution (exactly the
 * {@link LAYER_OWNED_MODEL_CONFIG_FIELDS} set). It appears only on {@link EffectiveLLMChatV2Data}, never
 * on the persisted node. `provider`/`model`/params/reasoning are **optional** (the overlay is partial —
 * undefined for an incomplete binding; honest about the post-resolution shape). `headers` +
 * `extraProviderOptions` are **non-optional** (their dedicated layer merges always yield a value).
 */
export type ChatV2LayerConfig = {
  provider?: ChatV2Provider;
  baseURL?: string;
  customProviderBaseURL?: string;
  apiKeySource?: LLMChatV2ApiKeySource;
  customProviderApiKeyEnvVarName?: string;
  headers: { key: string; value: string }[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  openAIReasoningEffort?: string;
  openAIReasoningSummary?: string;
  enableOpenAIWebSearch?: boolean;
  openAIWebSearchContextSize?: 'low' | 'medium' | 'high';
  enableOpenAICodeInterpreter?: boolean;
  anthropicThinkingMode?: '' | 'adaptive' | 'enabled' | 'disabled';
  anthropicThinkingBudget?: number;
  anthropicEffort?: '' | 'low' | 'medium' | 'high' | 'max';
  anthropicCacheControlTtl?: '' | '5m' | '1h';
  googleThinkingBudget?: number;
  googleThinkingLevel?: '' | 'minimal' | 'low' | 'medium' | 'high';
  googleIncludeThoughts?: boolean;
  enableGoogleSearchGrounding?: boolean;
  enableGoogleUrlContext?: boolean;
  extraProviderOptions: string;
};

/** The resolver's return: node-owned ⊕ layer config — what the runtime, getBody, and the card consume. */
export type EffectiveLLMChatV2Data = LLMChatV2NodeData & ChatV2LayerConfig;

/** Effective config after the completeness gate — `provider` + `model` guaranteed (see assess). */
export type CompleteEffectiveLLMChatV2Data = EffectiveLLMChatV2Data & { provider: ChatV2Provider; model: string };

/** Compile-time `never` assertion helper. */
type AssertNever<T extends never> = T;
/**
 * **The split's core invariant, compiler-enforced:** the node type and the layer type share NO key — the
 * node structurally cannot carry a layer field (a field landing in both is a compile error, not a silent
 * regression). (`LAYER_OWNED`-completeness is asserted alongside the list in resolveEffectiveLLMChatV2Data.)
 */
export type _AssertNodeLayerDisjoint = AssertNever<keyof LLMChatV2NodeData & keyof ChatV2LayerConfig>;

export type LLMChatV2EditorCacheKeyParts = {
  nodeId: NodeId;
  nodeData: LLMChatV2NodeData;
  provider: ChatV2Provider;
  modelId: string;
  providerConfig: unknown;
  apiKeyFingerprint?: string;
  prompt: unknown;
  systemPrompt: unknown;
  functions: unknown;
  generationParameters: unknown;
  responseFormatParameters: unknown;
  providerOptions: unknown;
  toolChoice: unknown;
};

export function createLLMChatV2NodeData(): LLMChatV2NodeData {
  // Mints ONLY node-owned fields (the type-split). The layer-owned model config is supplied by the
  // resolved Profile/Skill/Preset; a fresh node is an unbound, incomplete binding until one is selected.
  return {
    ...createChatV2CommonNodeData(),
    useCustomProviderBaseURLInput: false,
    useBaseURLInput: false,
    useHeadersInput: false,
    useExtraProviderOptionsInput: false,
    useAnthropicThinkingBudgetInput: false,
    useGoogleThinkingBudgetInput: false,
    openAIPreviousResponseId: '',
    useOpenAIPreviousResponseIdInput: false,
    responseFormat: '',
    responseSchemaName: '',
    useResponseSchemaNameInput: false,
    responseSchemaDescription: '',
    useResponseSchemaDescriptionInput: false,
    toolChoice: '',
    toolChoiceFunction: '',
    parallelToolCalls: false,
    autoContinueToolCalls: false,
    maxToolRounds: 3,
    retryOnNon200: false,
    retryOnNon200RepeatTimes: DEFAULT_LLM_CHAT_V2_RETRY_ON_NON_200_REPEAT_TIMES,
    retryOnNon200CooldownMs: DEFAULT_LLM_CHAT_V2_RETRY_ON_NON_200_COOLDOWN_MS,
    outputRequestStatus: false,
    llmPresetId: '',
    llmProfileId: '',
    llmSkillId: '',
    useLlmPresetIdInput: false,
    useLlmProfileIdInput: false,
    useLlmSkillIdInput: false,
  };
}

/** Reads layer-owned fields → operates on the resolved effective config, not the persisted node. */
export function hasLLMChatV2BuiltInToolsEnabled(data: EffectiveLLMChatV2Data): boolean {
  return (
    (data.provider === 'openai' && (Boolean(data.enableOpenAIWebSearch) || Boolean(data.enableOpenAICodeInterpreter))) ||
    (data.provider === 'google' && (Boolean(data.enableGoogleSearchGrounding) || Boolean(data.enableGoogleUrlContext)))
  );
}
