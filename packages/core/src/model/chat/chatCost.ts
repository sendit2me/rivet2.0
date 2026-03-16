import type { ChatCompletionChunkUsage } from '../../utils/openai.js';

export type ChatModelCost = {
  prompt: number;
  completion: number;
  audioPrompt?: number;
  audioCompletion?: number;
};

export function getCostForTokens(tokenCount: number, costPerThousand: number) {
  return (tokenCount / 1000) * costPerThousand;
}

export function calculatePromptAndCompletionCost(
  inputTokenCount: number,
  outputTokenCount: number,
  costs: Pick<ChatModelCost, 'prompt' | 'completion'>,
) {
  const promptCost = getCostForTokens(inputTokenCount, costs.prompt);
  const completionCost = getCostForTokens(outputTokenCount, costs.completion);

  return {
    promptCost,
    completionCost,
    totalCost: promptCost + completionCost,
  };
}

export function calculateAudioUsageCost(
  usage: {
    prompt_tokens_details: { text_tokens: number; audio_tokens: number };
    completion_tokens_details: { text_tokens: number; audio_tokens: number };
  },
  costs: ChatModelCost,
) {
  const promptCost = getCostForTokens(usage.prompt_tokens_details.text_tokens, costs.prompt);
  const completionCost = getCostForTokens(usage.completion_tokens_details.text_tokens, costs.completion);
  const audioPromptCost = getCostForTokens(usage.prompt_tokens_details.audio_tokens, costs.audioPrompt ?? 0);
  const audioCompletionCost = getCostForTokens(usage.completion_tokens_details.audio_tokens, costs.audioCompletion ?? 0);

  return {
    promptCost,
    completionCost,
    audioPromptCost,
    audioCompletionCost,
    totalCost: promptCost + completionCost + audioPromptCost + audioCompletionCost,
  };
}

export function getOutputTokensForCostCalculation(
  usage: ChatCompletionChunkUsage | undefined,
  fallbackTokenCount: number,
) {
  if (!usage?.completion_tokens_details) {
    return fallbackTokenCount;
  }

  return usage.completion_tokens_details.rejected_prediction_tokens > 0
    ? usage.completion_tokens_details.rejected_prediction_tokens
    : usage.completion_tokens;
}
