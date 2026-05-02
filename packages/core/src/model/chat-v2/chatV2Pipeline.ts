import type { LanguageModelUsage } from 'ai';
import type { ChatMessage } from '../DataValue.js';
import type { Outputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';
import { coercePromptToChatMessages, prependSystemPrompt } from '../chat/chatMessages.js';
import { createAssistantMessagesOutput, type StreamedFunctionCall } from '../chat/streamChatResponse.js';
import { streamChatV2 } from './aiSdkBridge.js';
import { chatMessagesToModelMessages } from './messageConverter.js';
import { calculateChatV2Cost } from './modelRegistry.js';
import type {
  ChatV2NormalizedUsage,
  ChatV2PipelineResult,
  ChatV2ReasoningOutput,
  RunChatV2PipelineOptions,
  StreamChatV2Result,
  StreamChatV2Options,
} from './chatV2Types.js';
import { chatV2ToolsToAiSdk } from './toolConverter.js';
import {
  getChatV2ProviderErrorStatusCode,
  isChatV2ProviderApiCallError,
  isChatV2ProviderFetchError,
  normalizeChatV2ProviderError,
} from './chatV2Errors.js';
import {
  normalizeLLMChatV2RetryCooldownMs,
  normalizeLLMChatV2RetryCount,
  waitForLLMChatV2RetryCooldown,
} from './chatV2Retry.js';

const REQUEST_STATUS_PORT_ID = 'requestStatus' as PortId;
const REQUEST_ERROR_PORT_ID = 'requestError' as PortId;

type StreamChatV2WithRetryResult = {
  result: StreamChatV2Result;
  requestStatuses: number[];
  requestErrors: unknown[];
  responseError?: unknown;
};

class StreamChatV2RetryFailure extends Error {
  constructor(
    public readonly error: unknown,
    public readonly requestStatuses: number[],
    public readonly requestErrors: unknown[],
  ) {
    super('Chat v2 retry attempts failed');
    this.name = 'StreamChatV2RetryFailure';
  }
}

function isStreamChatV2RetryFailure(error: unknown): error is StreamChatV2RetryFailure {
  return error instanceof StreamChatV2RetryFailure;
}

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
  const cachedTokens =
    (usage.inputTokenDetails?.cacheReadTokens ?? 0) + (usage.inputTokenDetails?.cacheWriteTokens ?? 0);
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
  reasoning: ChatV2ReasoningOutput,
  requestStatus: number | undefined,
  responseError: string | undefined,
  requestStatuses: number[],
  requestErrors: string[],
  options: Pick<
    RunChatV2PipelineOptions,
    | 'outputUsage'
    | 'outputReasoning'
    | 'outputRequestStatus'
    | 'includeFunctionCalls'
    | 'functionCallMode'
    | 'retryOnNon200'
  >,
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

  if (options.outputReasoning) {
    outputs['reasoning' as PortId] = Array.isArray(reasoning)
      ? {
          type: 'string[]',
          value: reasoning,
        }
      : {
          type: 'string',
          value: reasoning,
        };
  }

  if (options.outputRequestStatus) {
    if (options.retryOnNon200) {
      outputs[REQUEST_STATUS_PORT_ID] = buildRetryAttemptOutput(
        'number[]',
        requestStatuses.length > 0 ? requestStatuses : [requestStatus ?? 200],
      );
      outputs[REQUEST_ERROR_PORT_ID] = buildRetryAttemptOutput('string[]', requestErrors);
    } else {
      outputs[REQUEST_STATUS_PORT_ID] = {
        type: 'number',
        value: requestStatus ?? 200,
      };
      outputs[REQUEST_ERROR_PORT_ID] =
        responseError != null
          ? {
              type: 'string',
              value: responseError,
            }
          : {
              type: 'control-flow-excluded',
              value: undefined,
            };
    }
  }

  return outputs;
}

function getProviderFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildProviderFailureOutputs(
  requestMessages: ChatMessage[],
  responseStatus: number | undefined,
  responseError: string,
  requestStatuses: number[],
  requestErrors: string[],
  options: Pick<RunChatV2PipelineOptions, 'outputUsage' | 'outputReasoning' | 'includeFunctionCalls' | 'retryOnNon200'>,
): Outputs {
  const outputs: Outputs = {};

  Object.assign(outputs, {
    [REQUEST_ERROR_PORT_ID]: options.retryOnNon200
      ? buildRetryAttemptOutput('string[]', requestErrors)
      : {
          type: 'string',
          value: responseError,
        },
    [REQUEST_STATUS_PORT_ID]: options.retryOnNon200
      ? buildRetryAttemptOutput('number[]', requestStatuses)
      : responseStatus == null
        ? {
            type: 'control-flow-excluded',
            value: undefined,
          }
        : {
            type: 'number',
            value: responseStatus,
          },
    ['response' as PortId]: {
      type: 'control-flow-excluded',
      value: undefined,
    },
    ['in-messages' as PortId]: {
      type: 'chat-message[]',
      value: requestMessages,
    },
    ['all-messages' as PortId]: {
      type: 'chat-message[]',
      value: requestMessages,
    },
    ['responseTokens' as PortId]: {
      type: 'control-flow-excluded',
      value: undefined,
    },
  } satisfies Outputs);

  if (options.includeFunctionCalls) {
    outputs['function-calls' as PortId] = {
      type: 'control-flow-excluded',
      value: undefined,
    };
  }

  if (options.outputUsage) {
    outputs['usage' as PortId] = {
      type: 'control-flow-excluded',
      value: undefined,
    };
  }

  if (options.outputReasoning) {
    outputs['reasoning' as PortId] = {
      type: 'control-flow-excluded',
      value: undefined,
    };
  }

  return outputs;
}

function buildRetryAttemptOutput(
  type: 'number[]',
  values: number[],
): { type: 'number[]'; value: number[] } | { type: 'control-flow-excluded'; value: undefined };
function buildRetryAttemptOutput(
  type: 'string[]',
  values: string[],
): { type: 'string[]'; value: string[] } | { type: 'control-flow-excluded'; value: undefined };
function buildRetryAttemptOutput(type: 'number[]' | 'string[]', values: number[] | string[]) {
  return values.length > 0
    ? {
        type,
        value: values,
      }
    : {
        type: 'control-flow-excluded' as const,
        value: undefined,
      };
}

function buildNon200StatusError(statusCode: number): Error & { statusCode: number } {
  const error = new Error(`Provider request returned non-200 status: ${statusCode}`) as Error & {
    statusCode: number;
  };
  error.name = 'AI_APICallError';
  error.statusCode = statusCode;
  return error;
}

function normalizeProviderFailureMessage(
  error: unknown,
  options: Pick<RunChatV2PipelineOptions, 'provider' | 'modelId'>,
): string {
  return getProviderFailureMessage(
    normalizeChatV2ProviderError(error, {
      provider: options.provider,
      modelId: options.modelId,
    }),
  );
}

function normalizeProviderFailureMessages(
  errors: unknown[],
  options: Pick<RunChatV2PipelineOptions, 'provider' | 'modelId'>,
): string[] {
  return errors.map((error) => normalizeProviderFailureMessage(error, options));
}

async function streamChatV2WithRetry(
  streamOptions: StreamChatV2Options,
  retryOptions: Pick<
    RunChatV2PipelineOptions,
    'context' | 'retryOnNon200' | 'retryOnNon200RepeatTimes' | 'retryOnNon200CooldownMs'
  >,
): Promise<StreamChatV2WithRetryResult> {
  const repeatTimes = retryOptions.retryOnNon200
    ? normalizeLLMChatV2RetryCount(retryOptions.retryOnNon200RepeatTimes)
    : 0;
  const cooldownMs = normalizeLLMChatV2RetryCooldownMs(retryOptions.retryOnNon200CooldownMs);
  const requestStatuses: number[] = [];
  const requestErrors: unknown[] = [];

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await streamChatV2(streamOptions);
      const statusCode = result.requestStatus ?? 200;

      if (retryOptions.retryOnNon200) {
        requestStatuses.push(statusCode);
      }

      if (!retryOptions.retryOnNon200 || statusCode === 200) {
        return { result, requestStatuses, requestErrors };
      }

      const responseError = buildNon200StatusError(statusCode);
      requestErrors.push(responseError);

      if (attempt >= repeatTimes) {
        return { result, requestStatuses, requestErrors, responseError };
      }

      await waitForLLMChatV2RetryCooldown(cooldownMs, retryOptions.context.signal);
    } catch (error) {
      const statusCode = getChatV2ProviderErrorStatusCode(error);

      if (!retryOptions.retryOnNon200 || statusCode == null || statusCode === 200) {
        throw error;
      }

      requestStatuses.push(statusCode);
      requestErrors.push(error);

      if (attempt >= repeatTimes) {
        throw new StreamChatV2RetryFailure(error, requestStatuses, requestErrors);
      }

      await waitForLLMChatV2RetryCooldown(cooldownMs, retryOptions.context.signal);
    }
  }
}

function buildProviderFailureResult(
  requestMessages: ChatMessage[],
  options: RunChatV2PipelineOptions,
  normalizedError: unknown,
  rawError: unknown,
  requestStatuses: number[],
  requestErrors: string[],
): ChatV2PipelineResult | undefined {
  if (!options.outputRequestStatus) {
    return undefined;
  }

  const statusCode = getChatV2ProviderErrorStatusCode(normalizedError);
  if (statusCode == null && !isChatV2ProviderApiCallError(rawError) && !isChatV2ProviderFetchError(rawError)) {
    return undefined;
  }
  const responseError = getProviderFailureMessage(normalizedError);
  const retryRequestStatuses = options.retryOnNon200
    ? requestStatuses.length > 0
      ? requestStatuses
      : statusCode == null
        ? []
        : [statusCode]
    : [];
  const retryRequestErrors = options.retryOnNon200 ? (requestErrors.length > 0 ? requestErrors : [responseError]) : [];

  const commonOutputs = buildProviderFailureOutputs(
    requestMessages,
    statusCode,
    responseError,
    retryRequestStatuses,
    retryRequestErrors,
    {
      outputUsage: options.outputUsage,
      outputReasoning: options.outputReasoning,
      includeFunctionCalls: options.includeFunctionCalls,
      retryOnNon200: options.retryOnNon200,
    },
  );
  const allMessagesOutput = commonOutputs['all-messages' as PortId];

  if (allMessagesOutput?.type !== 'chat-message[]') {
    throw new Error('Chat v2 provider failure expected all-messages output to be chat-message[].');
  }

  return {
    commonOutputs,
    requestMessages,
    allMessages: allMessagesOutput.value,
    response: '',
    functionCalls: [],
    reasoning: '',
    usage: undefined,
    rawUsage: undefined,
    finishReason: undefined,
    providerMetadata: undefined,
    requestStatus: statusCode,
  };
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
  const functionTools =
    options.functions != null && options.functions.length > 0 ? chatV2ToolsToAiSdk(options.functions) : undefined;
  const tools =
    functionTools == null
      ? options.additionalTools
      : options.additionalTools == null
        ? functionTools
        : { ...functionTools, ...options.additionalTools };

  const streamed = await streamChatV2WithRetry(
    {
      model: options.model,
      messages: modelMessages,
      tools,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      topK: options.topK,
      presencePenalty: options.presencePenalty,
      frequencyPenalty: options.frequencyPenalty,
      stopSequences: options.stopSequences,
      seed: options.seed,
      responseOutput: options.responseOutput,
      providerOptions: options.providerOptions,
      toolChoice: options.toolChoice,
      abortSignal: options.context.signal,
      executeStream: options.executeStream,
      onPartialOutput:
        options.emitPartialOutputs === false
          ? undefined
          : ({ text, functionCalls }) => {
              options.context.onPartialOutputs?.(
                buildCommonOutputs(requestMessages, text, functionCalls, undefined, '', undefined, undefined, [], [], {
                  outputUsage: false,
                  outputReasoning: false,
                  outputRequestStatus: false,
                  includeFunctionCalls: options.includeFunctionCalls,
                  functionCallMode: options.functionCallMode,
                  retryOnNon200: false,
                }),
              );
            },
    },
    options,
  ).catch((caughtError: unknown) => {
    const retryFailure = isStreamChatV2RetryFailure(caughtError) ? caughtError : undefined;
    const rawError = retryFailure?.error ?? caughtError;
    const normalizedError = normalizeChatV2ProviderError(rawError, {
      provider: options.provider,
      modelId: options.modelId,
    });
    const requestStatuses = retryFailure?.requestStatuses ?? [];
    const requestErrors = normalizeProviderFailureMessages(retryFailure?.requestErrors ?? [], options);
    const failureResult = buildProviderFailureResult(
      requestMessages,
      options,
      normalizedError,
      rawError,
      requestStatuses,
      requestErrors,
    );
    if (failureResult) {
      return failureResult;
    }
    throw normalizedError;
  });

  if ('commonOutputs' in streamed) {
    return streamed;
  }

  const usage = normalizeUsage(streamed.result.usage, options);
  const requestStatuses = streamed.requestStatuses;
  const requestErrors = normalizeProviderFailureMessages(streamed.requestErrors, options);
  const responseError = streamed.responseError
    ? normalizeProviderFailureMessage(streamed.responseError, options)
    : undefined;
  const commonOutputs = buildCommonOutputs(
    requestMessages,
    streamed.result.responseText,
    streamed.result.functionCalls,
    usage,
    streamed.result.reasoning,
    streamed.result.requestStatus,
    responseError,
    requestStatuses,
    requestErrors,
    {
      outputUsage: options.outputUsage,
      outputReasoning: options.outputReasoning,
      outputRequestStatus: options.outputRequestStatus,
      includeFunctionCalls: options.includeFunctionCalls,
      functionCallMode: options.functionCallMode,
      retryOnNon200: options.retryOnNon200,
    },
  );
  const allMessagesOutput = commonOutputs['all-messages' as PortId];

  if (allMessagesOutput?.type !== 'chat-message[]') {
    throw new Error('Chat v2 pipeline expected all-messages output to be chat-message[].');
  }

  return {
    commonOutputs,
    requestMessages,
    allMessages: allMessagesOutput.value,
    response: streamed.result.responseText,
    functionCalls: streamed.result.functionCalls,
    reasoning: streamed.result.reasoning,
    usage,
    rawUsage: streamed.result.usage,
    finishReason: streamed.result.finishReason,
    providerMetadata: streamed.result.providerMetadata,
    requestStatus: streamed.result.requestStatus ?? 200,
  };
}
