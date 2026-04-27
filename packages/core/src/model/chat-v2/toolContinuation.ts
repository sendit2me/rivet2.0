import type { ChatMessageDataValue, GptFunction } from '../DataValue.js';
import type { ChatV2PipelineResult, RunChatV2PipelineOptions } from './chatV2Types.js';
import type { StreamedFunctionCall } from '../chat/streamChatResponse.js';
import { runChatV2Pipeline } from './chatV2Pipeline.js';
import type { DelegatedToolCallRecord } from '../nodes/toolCallDelegation.js';
import type { PortId } from '../NodeBase.js';

export type ToolContinuationOptions = RunChatV2PipelineOptions & {
  autoContinue: boolean;
  maxToolRounds: number;
  functions: GptFunction[] | undefined;
  delegateToolCall: (toolCall: StreamedFunctionCall) => Promise<ToolContinuationToolResult>;
  runPipeline?: (options: RunChatV2PipelineOptions) => Promise<ChatV2PipelineResult>;
};

export type ToolContinuationToolResult = ChatMessageDataValue & {
  delegatedToolCall?: DelegatedToolCallRecord;
};

function getToolNames(functions: GptFunction[] | undefined): Set<string> {
  return new Set((functions ?? []).map((fn) => fn.name).filter((name) => name.trim().length > 0));
}

function canAutoContinue(functionCalls: StreamedFunctionCall[], toolNames: Set<string>): boolean {
  return functionCalls.length > 0 && functionCalls.every((call) => toolNames.has(call.name));
}

export async function runChatV2PipelineWithToolContinuation(
  options: ToolContinuationOptions,
): Promise<ChatV2PipelineResult> {
  const {
    autoContinue,
    maxToolRounds,
    functions,
    delegateToolCall,
    runPipeline = runChatV2Pipeline,
    ...pipelineOptions
  } = options;
  const toolNames = getToolNames(functions);
  const maxRounds = Math.max(1, Math.floor(Number.isFinite(maxToolRounds) ? maxToolRounds : 1));

  let currentPrompt = pipelineOptions.prompt;
  let currentSystemPrompt = pipelineOptions.systemPrompt;
  const delegatedToolCalls: DelegatedToolCallRecord[] = [];

  for (let completedRounds = 0; ; completedRounds++) {
    const result = await runPipeline({
      ...pipelineOptions,
      functions,
      prompt: currentPrompt,
      systemPrompt: currentSystemPrompt,
    });

    if (
      !autoContinue ||
      completedRounds >= maxRounds ||
      !canAutoContinue(result.functionCalls, toolNames)
    ) {
      if (result.functionCalls.length === 0 && delegatedToolCalls.length > 0 && pipelineOptions.includeFunctionCalls) {
        result.commonOutputs['function-calls' as PortId] = {
          type: 'object[]',
          value: delegatedToolCalls,
        };
      }

      return result;
    }

    const toolResultMessages = await Promise.all(result.functionCalls.map(delegateToolCall));
    delegatedToolCalls.push(
      ...toolResultMessages
        .map((message) => message.delegatedToolCall)
        .filter((record): record is DelegatedToolCallRecord => record != null),
    );

    currentPrompt = {
      type: 'chat-message[]',
      value: [...result.allMessages, ...toolResultMessages.map((message) => message.value)],
    };
    currentSystemPrompt = undefined;
  }
}
