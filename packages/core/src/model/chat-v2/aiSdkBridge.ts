import { streamText } from 'ai';
import { consumeAiSdkStream } from '../chat/aiSdkStreaming.js';
import type {
  ChatV2StreamExecutor,
  ChatV2StreamHandle,
  StreamChatV2Options,
  StreamChatV2Result,
} from './chatV2Types.js';

function keepPromiseHandled<T>(value: PromiseLike<T>): Promise<T> {
  const promise = Promise.resolve(value);
  void promise.catch(() => undefined);
  return promise;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function markOptionalPromiseHandled(value: unknown): void {
  if (isPromiseLike(value)) {
    void keepPromiseHandled(value);
  }
}

function defaultStreamExecutor(args: Parameters<typeof streamText>[0]): ChatV2StreamHandle {
  const result = streamText(args);

  return {
    fullStream: result.fullStream,
    finishReason:
      'finishReason' in result
        ? keepPromiseHandled(
            Promise.resolve(result.finishReason).then((value) => (value == null ? undefined : String(value))),
          )
        : undefined,
    providerMetadata:
      'providerMetadata' in result
        ? keepPromiseHandled(
            Promise.resolve(result.providerMetadata as unknown as StreamChatV2Result['providerMetadata']),
          )
        : undefined,
    requestStatus: 200,
    usage:
      'usage' in result
        ? keepPromiseHandled(Promise.resolve(result.usage as unknown as StreamChatV2Result['usage']))
        : undefined,
  };
}

async function resolveOptionalValue<T>(value: T | PromiseLike<T> | undefined): Promise<T | undefined> {
  return value == null ? undefined : await value;
}

async function executeStream(
  options: StreamChatV2Options,
  executor: ChatV2StreamExecutor,
): Promise<StreamChatV2Result> {
  const args: Parameters<typeof streamText>[0] = {
    model: options.model,
    messages: options.messages,
  };

  if (options.tools !== undefined) args.tools = options.tools;
  if (options.maxTokens !== undefined) args.maxOutputTokens = options.maxTokens;
  if (options.temperature !== undefined) args.temperature = options.temperature;
  if (options.topP !== undefined) args.topP = options.topP;
  if (options.topK !== undefined) args.topK = options.topK;
  if (options.presencePenalty !== undefined) args.presencePenalty = options.presencePenalty;
  if (options.frequencyPenalty !== undefined) args.frequencyPenalty = options.frequencyPenalty;
  if (options.stopSequences !== undefined) args.stopSequences = options.stopSequences;
  if (options.seed !== undefined) args.seed = options.seed;
  if (options.responseOutput !== undefined) args.output = options.responseOutput;
  if (options.providerOptions !== undefined) args.providerOptions = options.providerOptions;
  if (options.toolChoice !== undefined) args.toolChoice = options.toolChoice;
  if (options.abortSignal !== undefined) args.abortSignal = options.abortSignal;

  const handle = await executor(args);
  markOptionalPromiseHandled(handle.finishReason);
  markOptionalPromiseHandled(handle.providerMetadata);
  markOptionalPromiseHandled(handle.requestStatus);
  markOptionalPromiseHandled(handle.usage);

  const streamed = await consumeAiSdkStream(handle.fullStream, (text, functionCalls) => {
    options.onPartialOutput?.({ text, functionCalls });
  });

  return {
    responseText: streamed.responseText,
    functionCalls: streamed.functionCalls,
    usage: streamed.usage ?? (await resolveOptionalValue(handle.usage)),
    reasoning: streamed.reasoning,
    finishReason: await resolveOptionalValue(handle.finishReason),
    providerMetadata: await resolveOptionalValue(handle.providerMetadata),
    requestStatus: await resolveOptionalValue(handle.requestStatus),
  };
}

export async function streamChatV2(options: StreamChatV2Options): Promise<StreamChatV2Result> {
  return executeStream(options, options.executeStream ?? defaultStreamExecutor);
}
