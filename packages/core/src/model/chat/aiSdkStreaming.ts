import type { LanguageModelUsage, TextStreamPart, ToolSet } from 'ai';
import type { StreamedFunctionCall } from './streamChatResponse.js';

export type AiSdkStreamResult = {
  responseText: string;
  functionCalls: StreamedFunctionCall[];
  usage: LanguageModelUsage | undefined;
  reasoning: string;
};

export async function consumeAiSdkStream(
  fullStream: AsyncIterable<TextStreamPart<ToolSet>>,
  onPartialOutputs: (text: string, functionCalls: StreamedFunctionCall[]) => void,
): Promise<AiSdkStreamResult> {
  let responseText = '';
  let reasoning = '';
  const functionCalls: StreamedFunctionCall[] = [];
  let usage: LanguageModelUsage | undefined;

  for await (const part of fullStream) {
    switch (part.type) {
      case 'text-delta': {
        responseText += part.text;
        onPartialOutputs(responseText, functionCalls);
        break;
      }

      case 'reasoning-delta': {
        reasoning += part.text;
        break;
      }

      case 'tool-call': {
        functionCalls.push({
          type: 'function',
          id: part.toolCallId,
          name: part.toolName,
          arguments: JSON.stringify(part.input),
          lastParsedArguments: part.input,
        });
        onPartialOutputs(responseText, functionCalls);
        break;
      }

      case 'finish': {
        usage = part.totalUsage;
        break;
      }

      case 'error': {
        throw part.error instanceof Error ? part.error : new Error(String(part.error));
      }
    }
  }

  return { responseText, functionCalls, usage, reasoning };
}
