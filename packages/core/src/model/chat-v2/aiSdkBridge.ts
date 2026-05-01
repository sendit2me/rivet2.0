import { streamText } from 'ai';
import { consumeAiSdkStream } from '../chat/aiSdkStreaming.js';
import type { ChatV2StreamExecutor, ChatV2StreamHandle, StreamChatV2Options, StreamChatV2Result } from './chatV2Types.js';

function defaultStreamExecutor(args: Parameters<typeof streamText>[0]): ChatV2StreamHandle {
  const result = streamText(args);

  return {
    fullStream: result.fullStream,
    finishReason:
      'finishReason' in result
        ? Promise.resolve(result.finishReason).then((value) => (value == null ? undefined : String(value)))
        : undefined,
    providerMetadata:
      'providerMetadata' in result
        ? Promise.resolve(result.providerMetadata as unknown as StreamChatV2Result['providerMetadata'])
        : undefined,
    usage:
      'usage' in result
        ? Promise.resolve(result.usage as unknown as StreamChatV2Result['usage'])
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
  };
}

export async function streamChatV2(options: StreamChatV2Options): Promise<StreamChatV2Result> {
  return executeStream(options, options.executeStream ?? defaultStreamExecutor);
}
