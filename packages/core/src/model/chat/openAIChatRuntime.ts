import { base64ToUint8Array } from '../../utils/base64.js';
import { getError } from '../../utils/errors.js';
import type { Tokenizer, TokenizerCallInfo } from '../../integrations/Tokenizer.js';
import type { ChatCompletionChunk, ChatCompletionChunkUsage } from '../../utils/openai.js';
import type { ChatMessage } from '../DataValue.js';
import type { Outputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';
import type { InternalProcessContext } from '../ProcessContext.js';
import { calculateAudioUsageCost, calculatePromptAndCompletionCost, getOutputTokensForCostCalculation } from './chatCost.js';
import { applyStreamedFunctionCallOutputs, applyToolCallDeltas, createAssistantMessagesOutput } from './streamChatResponse.js';
import { setRequestAndResponseTokenOutputs } from './tokenBudget.js';

export async function applyOpenAINonStreamingResponse(params: {
  response: {
    choices: Array<{
      message: {
        content?: string | null;
        audio?: { data: string; transcript: string } | null;
      };
    }>;
    usage?: {
      prompt_tokens_details: { text_tokens: number; audio_tokens: number };
      completion_tokens_details: { text_tokens: number; audio_tokens: number };
    };
  };
  output: Outputs;
  messages: ChatMessage[];
  isMultiResponse: boolean;
  modalities: ('text' | 'audio')[] | undefined;
  audioFormat: 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16' | undefined;
  modelCosts:
    | {
        prompt?: number;
        completion?: number;
        audioPrompt?: number;
        audioCompletion?: number;
      }
    | undefined;
  durationMs: number;
}) {
  const { response, output, messages, isMultiResponse, modalities, audioFormat, modelCosts, durationMs } = params;

  if (isMultiResponse) {
    output['response' as PortId] = {
      type: 'string[]',
      value: response.choices.map((choice) => choice.message.content ?? ''),
    };
  } else {
    output['response' as PortId] = {
      type: 'string',
      value: response.choices[0]!.message.content ?? '',
    };
    output['all-messages' as PortId] = {
      type: 'chat-message[]',
      value: [
        ...messages,
        {
          type: 'assistant',
          message: response.choices[0]!.message.content ?? '',
          function_calls: undefined,
          isCacheBreakpoint: false,
          function_call: undefined,
        },
      ],
    };
  }

  if (modalities?.includes('audio')) {
    const audioData = response.choices[0]!.message.audio;
    output['audio' as PortId] = {
      type: 'audio',
      value: {
        data: base64ToUint8Array(audioData!.data),
        mediaType: audioFormatToMediaType(audioFormat ?? 'wav'),
      },
    };
    output['audioTranscript' as PortId] = {
      type: 'string',
      value: audioData!.transcript,
    };
  }

  output['duration' as PortId] = { type: 'number', value: durationMs };

  if (response.usage) {
    output['usage' as PortId] = {
      type: 'object',
      value: response.usage,
    };

    const usageCosts = calculateAudioUsageCost(response.usage, {
      prompt: modelCosts?.prompt ?? 0,
      completion: modelCosts?.completion ?? 0,
      audioPrompt: modelCosts?.audioPrompt ?? 0,
      audioCompletion: modelCosts?.audioCompletion ?? 0,
    });

    output['cost' as PortId] = {
      type: 'number',
      value: usageCosts.totalCost,
    };
  }
}

export async function applyOpenAIStreamingResponse(params: {
  chunks: AsyncIterable<ChatCompletionChunk>;
  output: Outputs;
  messages: ChatMessage[];
  isMultiResponse: boolean;
  parallelFunctionCalling: boolean | undefined;
  context: Pick<InternalProcessContext, 'onPartialOutputs' | 'settings'>;
  tokenizer: Pick<Tokenizer, 'getTokenCountForString'>;
  tokenizerInfo: TokenizerCallInfo;
  inputTokenCount: number;
  numberOfChoices: number | undefined;
  useServerTokenCalculation: boolean | undefined;
  modelCosts: { prompt: number; completion: number };
}) {
  const {
    chunks,
    output,
    messages,
    isMultiResponse,
    parallelFunctionCalling,
    context,
    tokenizer,
    tokenizerInfo,
    inputTokenCount: initialInputTokenCount,
    numberOfChoices,
    useServerTokenCalculation,
    modelCosts,
  } = params;

  const responseChoicesParts: string[][] = [];
  const functionCalls: {
    type: 'function';
    id: string;
    name: string;
    arguments: string;
    lastParsedArguments?: unknown;
  }[][] = [];

  let usage: ChatCompletionChunkUsage | undefined;
  let throttleLastCalledTime = Date.now();
  const onPartialOutput = (partialOutput: Outputs) => {
    const now = Date.now();
    if (now - throttleLastCalledTime > (context.settings.throttleChatNode ?? 100)) {
      context.onPartialOutputs?.(partialOutput);
      throttleLastCalledTime = now;
    }
  };

  for await (const chunk of chunks) {
    if (chunk.usage) {
      usage = chunk.usage;
    }
    if (!chunk.choices) {
      continue;
    }

    for (const { delta, index } of chunk.choices) {
      if (delta.content != null) {
        responseChoicesParts[index] ??= [];
        responseChoicesParts[index]!.push(delta.content);
      }
      if (delta.tool_calls) {
        functionCalls[index] ??= [];
        applyToolCallDeltas(functionCalls, index, delta.tool_calls);
      }
    }

    if (isMultiResponse) {
      output['response' as PortId] = {
        type: 'string[]',
        value: responseChoicesParts.map((parts) => parts.join('')),
      };
    } else {
      output['response' as PortId] = {
        type: 'string',
        value: responseChoicesParts[0]?.join('') ?? '',
      };
    }

    applyStreamedFunctionCallOutputs(output, functionCalls, isMultiResponse, parallelFunctionCalling);
    onPartialOutput(output);
  }

  context.onPartialOutputs?.(output);

  if (!isMultiResponse) {
    output['all-messages' as PortId] = createAssistantMessagesOutput(
      messages,
      responseChoicesParts[0]?.join('') ?? '',
      functionCalls[0],
    );
  }

  if (responseChoicesParts.length === 0 && functionCalls.length === 0) {
    throw new Error('No response from OpenAI');
  }

  let inputTokenCount = initialInputTokenCount;
  let outputTokenCount = 0;
  if (usage) {
    inputTokenCount = usage.prompt_tokens;
    outputTokenCount = usage.completion_tokens;
  }

  output['in-messages' as PortId] = { type: 'chat-message[]', value: messages };
  setRequestAndResponseTokenOutputs(output, inputTokenCount * (numberOfChoices ?? 1), outputTokenCount);

  if (!useServerTokenCalculation) {
    let responseTokenCount = 0;
    for (const choiceParts of responseChoicesParts) {
      responseTokenCount += await tokenizer.getTokenCountForString(choiceParts.join(), tokenizerInfo);
    }
    outputTokenCount = responseTokenCount;
    setRequestAndResponseTokenOutputs(output, inputTokenCount * (numberOfChoices ?? 1), outputTokenCount);
  }

  const outputTokensForCostCalculation = getOutputTokensForCostCalculation(usage, outputTokenCount);
  const { promptCost, completionCost, totalCost } = calculatePromptAndCompletionCost(
    inputTokenCount,
    outputTokensForCostCalculation,
    modelCosts,
  );

  if (usage) {
    output['usage' as PortId] = {
      type: 'object',
      value: {
        ...usage,
        prompt_cost: promptCost,
        completion_cost: completionCost,
        total_cost: totalCost,
      },
    };
  } else {
    output['usage' as PortId] = {
      type: 'object',
      value: {
        prompt_tokens: inputTokenCount,
        completion_tokens: outputTokenCount,
      },
    };
  }

  output['cost' as PortId] = { type: 'number', value: totalCost };
}

export function handleOpenAIRetryableFailure(params: {
  originalError: unknown;
  context: Pick<InternalProcessContext, 'signal' | 'trace' | 'onPartialOutputs'>;
}) {
  const { originalError, context } = params;

  let err = originalError;
  if (String(originalError).includes('fetch failed') && originalError && typeof originalError === 'object' && 'cause' in originalError) {
    const originalCause = (originalError as { cause?: unknown }).cause;
    const cause =
      getError(originalCause) instanceof AggregateError
        ? (originalCause as AggregateError).errors[0]
        : getError(originalCause);
    err = cause;
  }

  if (context.signal.aborted) {
    throw new Error('Aborted');
  }

  context.trace(`ChatNode failed, retrying: ${String(err)}`);

  const retriesLeft =
    err && typeof err === 'object' && 'retriesLeft' in err ? (err as { retriesLeft?: number }).retriesLeft : undefined;

  if (
    String(err).includes('terminated') ||
    String(originalError).includes('terminated') ||
    String(err).includes('fetch failed')
  ) {
    return;
  }

  if (!(err instanceof Error) || !('status' in err)) {
    if (err && typeof err === 'object' && 'code' in err) {
      throw err;
    }
    return;
  }

  const openAIError = err as Error & { status: number; message: string };

  if (openAIError.status === 429 && retriesLeft) {
    context.onPartialOutputs?.({
      ['response' as PortId]: {
        type: 'string',
        value: 'OpenAI API rate limit exceeded, retrying...',
      },
    });
    return;
  }

  if (openAIError.status === 408 && retriesLeft) {
    context.onPartialOutputs?.({
      ['response' as PortId]: {
        type: 'string',
        value: 'OpenAI API timed out, retrying...',
      },
    });
    return;
  }

  if (openAIError.status >= 400 && openAIError.status < 500) {
    throw new Error(openAIError.message);
  }
}

function audioFormatToMediaType(format: 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16') {
  switch (format) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'flac':
      return 'audio/flac';
    case 'opus':
      return 'audio/opus';
    case 'pcm16':
      return 'audio/wav';
  }
}
