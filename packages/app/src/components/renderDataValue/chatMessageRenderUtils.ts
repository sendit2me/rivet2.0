import type { AssistantChatMessage, AssistantChatMessageFunctionCall } from '@ironclad/rivet-core';

export type RenderableAssistantFunctionCall =
  | {
      type: 'single';
      functionCall: AssistantChatMessageFunctionCall;
    }
  | {
      type: 'multiple';
      functionCalls: AssistantChatMessageFunctionCall[];
    };

export function getRenderableAssistantFunctionCall(
  message: AssistantChatMessage,
): RenderableAssistantFunctionCall | undefined {
  if (message.function_calls?.length) {
    return {
      type: 'multiple',
      functionCalls: message.function_calls,
    };
  }

  if (message.function_call) {
    return {
      type: 'single',
      functionCall: message.function_call,
    };
  }

  return undefined;
}
