import type { NodeInputDefinition, NodeOutputDefinition, PortId } from '../NodeBase.js';

/**
 * The node-owned shared chat fields — the node-owned output-behaviour flags. The model + sampling
 * *values* are layer-owned (on `ChatV2LayerConfig`, appearing only on `EffectiveLLMChatV2Data`). The
 * per-param "drive from input" toggles are gone (cut #4): they were vestigial post-R2 — the per-param
 * ports were filtered out and the toggles unsettable, so the runtime read the resolved value regardless.
 * The chat-v2 runtime now reads those params directly off the effective config.
 */
export type ChatV2CommonNodeData = {
  useToolCalling: boolean;
  outputUsage: boolean;
  outputReasoning: boolean;
  cache: boolean;
  useAsGraphPartialOutput?: boolean;
};


export type CommonChatV2InputOptions = {
  systemPromptPortId?: PortId;
  promptPortId?: PortId;
  functionsPortId?: PortId;
  includeFunctions?: boolean;
};

export type CommonChatV2OutputOptions = {
  responsePortId?: PortId;
  inMessagesPortId?: PortId;
  allMessagesPortId?: PortId;
  functionCallsPortId?: PortId;
  responseTokensPortId?: PortId;
  usagePortId?: PortId;
  reasoningPortId?: PortId;
  includeFunctionCalls?: boolean;
  includeUsage?: boolean;
  includeReasoning?: boolean;
};

export function createChatV2CommonNodeData(
  overrides: Partial<ChatV2CommonNodeData> = {},
): ChatV2CommonNodeData {
  return {
    useToolCalling: false,
    outputUsage: false,
    outputReasoning: false,
    cache: false,
    useAsGraphPartialOutput: true,
    ...overrides,
  };
}

export function getCommonChatV2Inputs(
  data: ChatV2CommonNodeData,
  options: CommonChatV2InputOptions = {},
): NodeInputDefinition[] {
  const {
    systemPromptPortId = 'systemPrompt' as PortId,
    promptPortId = 'prompt' as PortId,
    functionsPortId = 'functions' as PortId,
    includeFunctions = data.useToolCalling,
  } = options;

  const inputs: NodeInputDefinition[] = [
    {
      id: systemPromptPortId,
      title: 'System Prompt',
      dataType: 'string',
      required: false,
      coerced: true,
    },
  ];

  // Per-param input ports (model/temperature/topP/…) were removed in cut #4 — they were filtered out
  // post-R2, so the runtime reads each param directly off the resolved effective config.

  if (includeFunctions) {
    inputs.push({
      id: functionsPortId,
      title: 'Tools',
      dataType: ['gpt-function', 'gpt-function[]'] as const,
      required: false,
      coerced: false,
    });
  }

  inputs.push({
    id: promptPortId,
    title: 'Prompt',
    dataType: ['chat-message', 'chat-message[]', 'string', 'string[]'] as const,
    coerced: true,
  });

  return inputs;
}

export function getCommonChatV2Outputs(
  data: ChatV2CommonNodeData,
  options: CommonChatV2OutputOptions = {},
): NodeOutputDefinition[] {
  const {
    responsePortId = 'response' as PortId,
    inMessagesPortId = 'in-messages' as PortId,
    allMessagesPortId = 'all-messages' as PortId,
    functionCallsPortId = 'function-calls' as PortId,
    responseTokensPortId = 'responseTokens' as PortId,
    usagePortId = 'usage' as PortId,
    reasoningPortId = 'reasoning' as PortId,
    includeFunctionCalls = data.useToolCalling,
    includeUsage = data.outputUsage,
    includeReasoning = data.outputReasoning,
  } = options;

  const outputs: NodeOutputDefinition[] = [
    {
      id: responsePortId,
      title: 'Response',
      dataType: 'string',
    },
    {
      id: inMessagesPortId,
      title: 'Messages Sent',
      dataType: 'chat-message[]',
    },
    {
      id: allMessagesPortId,
      title: 'All Messages',
      dataType: 'chat-message[]',
    },
    {
      id: responseTokensPortId,
      title: 'Response Tokens',
      dataType: 'number',
    },
  ];

  if (includeFunctionCalls) {
    outputs.push({
      id: functionCallsPortId,
      title: 'Tool Calls',
      dataType: 'object[]',
    });
  }

  if (includeUsage) {
    outputs.push({
      id: usagePortId,
      title: 'Usage',
      dataType: 'object',
    });
  }

  if (includeReasoning) {
    outputs.push({
      id: reasoningPortId,
      title: 'Reasoning',
      dataType: ['string', 'string[]'] as const,
    });
  }

  return outputs;
}
