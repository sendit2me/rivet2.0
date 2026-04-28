import { anthropicModels } from '../../plugins/anthropic/anthropic.js';
import { generativeAiGoogleModels } from '../../plugins/google/google.js';
import { openaiModels } from '../../utils/openai.js';
import type { ChatV2Provider } from './chatV2Types.js';

export type ChatV2ModelInfo = {
  maxTokens: number;
  displayName: string;
  cost: {
    prompt: number;
    completion: number;
  };
};

const chatV2ModelRegistry = {
  openai: openaiModels,
  anthropic: anthropicModels,
  google: generativeAiGoogleModels,
  custom: {},
} as const;

export function getChatV2ModelRegistry() {
  return chatV2ModelRegistry;
}

export function getChatV2ModelInfo(provider: ChatV2Provider, modelId: string): ChatV2ModelInfo | undefined {
  const providerModels = chatV2ModelRegistry[provider] as Record<string, ChatV2ModelInfo>;
  return providerModels[modelId];
}

export function calculateChatV2Cost(
  provider: ChatV2Provider,
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number | undefined {
  const model = getChatV2ModelInfo(provider, modelId);
  if (model == null) {
    return undefined;
  }

  return model.cost.prompt * promptTokens + model.cost.completion * completionTokens;
}
