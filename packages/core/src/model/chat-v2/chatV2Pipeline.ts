import type { LanguageModelUsage } from 'ai';
import type { ChatMessage } from '../DataValue.js';
import type { Outputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';
import { coercePromptToChatMessages, prependSystemPrompt } from '../chat/chatMessages.js';
import { createAssistantMessagesOutput, type StreamedFunctionCall } from '../chat/streamChatResponse.js';
import { streamChatV2 } from './aiSdkBridge.js';
import { chatMessagesToModelMessages } from './messageConverter.js';
import { calculateChatV2Cost } from './modelRegistry.js';
import type { ChatV2NormalizedUsage, ChatV2PipelineResult, RunChatV2PipelineOptions } from './chatV2Types.js';
import { chatV2ToolsToAiSdk } from './toolConverter.js';

function toFunctionCallOutputValue(functionCall: StreamedFunctionCall) {
  let argumentsValue = functionCall.lastParsedArguments;

  if (argumentsValue == null) {
    try {
      argumentsValue = JSON.parse(functionCall.arguments);
    } catch {
      argumentsValue = functionCall.arguments;
    }
  }

  return {
    name: functionCall.name,
    arguments: argumentsValue,
    id: functionCall.id,
  };
}

function normalizeUsage(
  usage: LanguageModelUsage | undefined,
  options: Pick<RunChatV2PipelineOptions, 'provider' | 'modelId'>,
): ChatV2NormalizedUsage | undefined {
  if (usage == null) {
    return undefined;
  }

  const promptTokens = usage.inputTokens ?? 0;
  const completionTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? promptTokens + completionTokens;
  const cachedTokens = (usage.inputTokenDetails?.cacheReadTokens ?? 0) + (usage.inputTokenDetails?.cacheWriteTokens ?? 0);
  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens ?? 0;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    reasoningTokens,
    totalCost: calculateChatV2Cost(options.provider, options.modelId, promptTokens, completionTokens),
  };
}

function buildCommonOutputs(
  requestMessages: ChatMessage[],
  response: string,
  functionCalls: StreamedFunctionCall[],
  usage: ChatV2NormalizedUsage | undefined,
  options: Pick<RunChatV2PipelineOptions, 'outputUsage' | 'includeFunctionCalls' | 'functionCallMode'>,
): Outputs {
  const outputs: Outputs = {
    ['response' as PortId]: { type: 'string', value: response },
    ['in-messages' as PortId]: { type: 'chat-message[]', value: requestMessages },
    ['all-messages' as PortId]: createAssistantMessagesOutput(requestMessages, response, functionCalls, {
      functionCallMode: options.functionCallMode,
    }),
    ['responseTokens' as PortId]: { type: 'number', value: usage?.completionTokens ?? 0 },
  };

  if (functionCalls.length > 0) {
    outputs['function-calls' as PortId] = {
      type: 'object[]',
      value: functionCalls.map(toFunctionCallOutputValue),
    };
  } else if (options.includeFunctionCalls) {
    outputs['function-calls' as PortId] = {
      type: 'control-flow-excluded',
      value: undefined,
    };
  }

  if (options.outputUsage) {
    outputs['usage' as PortId] = {
      type: 'object',
      value: usage ?? {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        totalCost: undefined,
      },
    };
  }

  return outputs;
}

export async function runChatV2Pipeline(options: RunChatV2PipelineOptions): Promise<ChatV2PipelineResult> {
  const requestMessages = prependSystemPrompt(
    coercePromptToChatMessages(options.prompt, { requirePrompt: true }),
    options.systemPrompt,
  );
  const modelMessages = await chatMessagesToModelMessages(requestMessages, {
    provider: options.provider,
    anthropicCacheControlTtl: options.anthropicCacheControlTtl,
  });
  const functionTools = options.functions != null && options.functions.length > 0 ? chatV2ToolsToAiSdk(options.functions) : undefined;
  const tools =
    functionTools == null
      ? options.additionalTools
      : options.additionalTools == null
        ? functionTools
        : { ...functionTools, ...options.additionalTools };

  const streamed = await streamChatV2({
    model: options.model,
    messages: modelMessages,
    tools,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
    stopSequences: options.stopSequences,
    providerOptions: options.providerOptions,
    abortSignal: options.context.signal,
    executeStream: options.executeStream,
    onPartialOutput:
      options.emitPartialOutputs === false
        ? undefined
        : ({ text, functionCalls }) => {
            options.context.onPartialOutputs?.(
              buildCommonOutputs(requestMessages, text, functionCalls, undefined, {
                outputUsage: false,
                includeFunctionCalls: options.includeFunctionCalls,
                functionCallMode: options.functionCallMode,
              }),
            );
          },
  });

  const usage = normalizeUsage(streamed.usage, options);
  const commonOutputs = buildCommonOutputs(requestMessages, streamed.responseText, streamed.functionCalls, usage, {
    outputUsage: options.outputUsage,
    includeFunctionCalls: options.includeFunctionCalls,
    functionCallMode: options.functionCallMode,
  });
  const allMessagesOutput = commonOutputs['all-messages' as PortId];

  if (allMessagesOutput?.type !== 'chat-message[]') {
    throw new Error('Chat v2 pipeline expected all-messages output to be chat-message[].');
  }

  return {
    commonOutputs,
    requestMessages,
    allMessages: allMessagesOutput.value,
    response: streamed.responseText,
    functionCalls: streamed.functionCalls,
    reasoning: streamed.reasoning,
    usage,
    rawUsage: streamed.usage,
    finishReason: streamed.finishReason,
    providerMetadata: streamed.providerMetadata,
  };
}
