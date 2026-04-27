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
  const handle = await executor({
    model: options.model,
    messages: options.messages,
    tools: options.tools,
    maxOutputTokens: options.maxTokens,
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
    stopSequences: options.stopSequences,
    providerOptions: options.providerOptions,
    toolChoice: options.toolChoice,
    abortSignal: options.abortSignal,
  });

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
