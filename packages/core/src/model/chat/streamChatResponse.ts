import type { ChatMessage } from '../DataValue.js';
import type { Outputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';

export type StreamedFunctionCall = {
  type: 'function';
  id: string;
  name: string;
  arguments: string;
  lastParsedArguments?: unknown;
};

export type AssistantMessageFunctionCallMode = 'first' | 'only' | 'never';

type StreamedToolCallDelta = {
  id?: string;
  index: number;
  function: {
    name?: string;
    arguments?: string;
  };
};

export function applyToolCallDeltas(
  functionCalls: StreamedFunctionCall[][],
  choiceIndex: number,
  toolCalls: StreamedToolCallDelta[],
) {
  functionCalls[choiceIndex] ??= [];

  for (const toolCall of toolCalls) {
    functionCalls[choiceIndex]![toolCall.index] ??= {
      type: 'function',
      arguments: '',
      lastParsedArguments: undefined,
      name: '',
      id: '',
    };

    const currentCall = functionCalls[choiceIndex]![toolCall.index]!;

    if (toolCall.id) {
      currentCall.id = toolCall.id;
    }

    if (toolCall.function.name) {
      currentCall.name += toolCall.function.name;
    }

    if (toolCall.function.arguments) {
      currentCall.arguments += toolCall.function.arguments;

      try {
        currentCall.lastParsedArguments = JSON.parse(currentCall.arguments);
      } catch {
        // Ignore partial JSON fragments until the stream completes.
      }
    }
  }
}

export function applyStreamedFunctionCallOutputs(
  output: Outputs,
  functionCalls: StreamedFunctionCall[][],
  isMultiResponse: boolean,
  parallelFunctionCalling: boolean | undefined,
) {
  if (functionCalls.length === 0) {
    return;
  }

  if (isMultiResponse) {
    output['function-call' as PortId] = {
      type: 'object[]',
      value: functionCalls.map((calls) => ({
        name: calls[0]?.name,
        arguments: calls[0]?.lastParsedArguments,
        id: calls[0]?.id,
      })),
    };
    return;
  }

  if (parallelFunctionCalling) {
    output['function-calls' as PortId] = {
      type: 'object[]',
      value: functionCalls[0]!.map((functionCall) => ({
        name: functionCall.name,
        arguments: functionCall.lastParsedArguments,
        id: functionCall.id,
      })),
    };
    return;
  }

  output['function-call' as PortId] = {
    type: 'object',
    value: {
      name: functionCalls[0]![0]?.name,
      arguments: functionCalls[0]![0]?.lastParsedArguments,
      id: functionCalls[0]![0]?.id,
    } as Record<string, unknown>,
  };
}

export function createAssistantMessagesOutput(
  messages: ChatMessage[],
  response: string,
  functionCalls: StreamedFunctionCall[] | undefined,
  options: { functionCallMode?: AssistantMessageFunctionCallMode } = {},
) {
  const functionCallMode = options.functionCallMode ?? 'first';
  const singleFunctionCall =
    functionCallMode === 'never'
      ? undefined
      : functionCallMode === 'only'
        ? functionCalls?.length === 1
          ? functionCalls[0]
          : undefined
        : functionCalls?.[0];

  return {
    type: 'chat-message[]' as const,
    value: [
      ...messages,
      {
        type: 'assistant' as const,
        message: response,
        function_call: singleFunctionCall
          ? {
              name: singleFunctionCall.name,
              arguments: singleFunctionCall.arguments,
              id: singleFunctionCall.id,
            }
          : undefined,
        function_calls: functionCalls
          ? functionCalls.map((fc) => ({
              name: fc.name,
              arguments: fc.arguments,
              id: fc.id,
            }))
          : undefined,
      },
    ],
  };
}
