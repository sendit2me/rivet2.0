import type { ChatMessage } from '../DataValue.js';
import type { PortId } from '../NodeBase.js';
import { coercePromptToChatMessages, prependSystemPrompt } from '../chat/chatMessages.js';
import { streamChatV2 } from './aiSdkBridge.js';
import { chatMessagesToModelMessages } from './messageConverter.js';
import type {
  ChatV2PipelineResult,
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
import {
  createChatV2CommonOutputs,
  createChatV2ProviderFailureOutputs,
  normalizeChatV2Usage,
} from './chatV2Outputs.js';

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

function getProviderFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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

  const commonOutputs = createChatV2ProviderFailureOutputs({
    requestMessages,
    responseStatus: statusCode,
    responseError,
    requestStatuses: retryRequestStatuses,
    requestErrors: retryRequestErrors,
    outputUsage: options.outputUsage,
    outputReasoning: options.outputReasoning,
    includeFunctionCalls: options.includeFunctionCalls,
    retryOnNon200: options.retryOnNon200,
  });
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
      responseFormat: options.responseFormat,
      providerOptions: options.providerOptions,
      toolChoice: options.toolChoice,
      abortSignal: options.context.signal,
      executeStream: options.executeStream,
      onPartialOutput:
        options.emitPartialOutputs === false
          ? undefined
          : ({ text, functionCalls }) => {
              options.context.onPartialOutputs?.(
                createChatV2CommonOutputs({
                  requestMessages,
                  response: text,
                  structuredOutput: undefined,
                  functionCalls,
                  usage: undefined,
                  reasoning: '',
                  requestStatus: undefined,
                  responseError: undefined,
                  requestStatuses: [],
                  requestErrors: [],
                  outputUsage: false,
                  outputReasoning: false,
                  outputRequestStatus: false,
                  includeFunctionCalls: options.includeFunctionCalls,
                  functionCallMode: options.functionCallMode,
                  retryOnNon200: false,
                  responseFormat: undefined,
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

  const usage = normalizeChatV2Usage(streamed.result.usage, options);
  const requestStatuses = streamed.requestStatuses;
  const requestErrors = normalizeProviderFailureMessages(streamed.requestErrors, options);
  const responseError = streamed.responseError
    ? normalizeProviderFailureMessage(streamed.responseError, options)
    : undefined;
  const commonOutputs = createChatV2CommonOutputs({
    requestMessages,
    response: streamed.result.responseText,
    structuredOutput: streamed.result.structuredOutput,
    functionCalls: streamed.result.functionCalls,
    usage,
    reasoning: streamed.result.reasoning,
    requestStatus: streamed.result.requestStatus,
    responseError,
    requestStatuses,
    requestErrors,
    outputUsage: options.outputUsage,
    outputReasoning: options.outputReasoning,
    outputRequestStatus: options.outputRequestStatus,
    includeFunctionCalls: options.includeFunctionCalls,
    functionCallMode: options.functionCallMode,
    retryOnNon200: options.retryOnNon200,
    responseFormat: options.responseFormat,
  });
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
