import type { NodeInputDefinition, NodeOutputDefinition, PortId } from '../NodeBase.js';

/**
 * The node-owned shared chat fields. The model + sampling *values* (model/temperature/topP/…) are
 * **layer-owned** — they live on `ChatV2LayerConfig` (supplied by the resolved Profile/Skill/Preset) and
 * appear only on `EffectiveLLMChatV2Data`. What stays node-persisted here is: the per-param "drive from
 * input" toggles (**vestigial** post-R2 — the per-param ports are filtered out and the toggles are
 * unsettable, so they read inertly in the runtime/getBody; the mechanism rip is a follow-up cut), and the
 * node-owned output-behaviour flags.
 */
export type ChatV2CommonNodeData = {
  useModelInput: boolean;
  useTemperatureInput: boolean;
  useTopPInput: boolean;
  useTopKInput: boolean;
  usePresencePenaltyInput: boolean;
  useFrequencyPenaltyInput: boolean;
  useStopSequencesInput: boolean;
  useSeedInput: boolean;
  useMaxTokensInput: boolean;
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
  includeTopP?: boolean;
  includeTopK?: boolean;
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
    useModelInput: false,
    useTemperatureInput: false,
    useTopPInput: false,
    useTopKInput: false,
    usePresencePenaltyInput: false,
    useFrequencyPenaltyInput: false,
    useStopSequencesInput: false,
    useSeedInput: false,
    useMaxTokensInput: false,
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
    includeTopP = true,
    includeTopK = true,
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

  if (data.useModelInput) {
    inputs.push({
      id: 'model' as PortId,
      title: 'Model',
      dataType: 'string',
      required: false,
    });
  }

  if (data.useTemperatureInput) {
    inputs.push({
      id: 'temperature' as PortId,
      title: 'Temperature',
      dataType: 'number',
    });
  }

  if (includeTopP && data.useTopPInput) {
    inputs.push({
      id: 'topP' as PortId,
      title: 'Top P',
      dataType: 'number',
    });
  }

  if (includeTopK && data.useTopKInput) {
    inputs.push({
      id: 'topK' as PortId,
      title: 'Top K',
      dataType: 'number',
    });
  }

  if (data.usePresencePenaltyInput) {
    inputs.push({
      id: 'presencePenalty' as PortId,
      title: 'Presence Penalty',
      dataType: 'number',
    });
  }

  if (data.useFrequencyPenaltyInput) {
    inputs.push({
      id: 'frequencyPenalty' as PortId,
      title: 'Frequency Penalty',
      dataType: 'number',
    });
  }

  if (data.useStopSequencesInput) {
    inputs.push({
      id: 'stopSequences' as PortId,
      title: 'Stop Sequences',
      dataType: ['string', 'string[]'] as const,
      required: false,
      coerced: true,
    });
  }

  if (data.useSeedInput) {
    inputs.push({
      id: 'seed' as PortId,
      title: 'Seed',
      dataType: 'number',
    });
  }

  if (data.useMaxTokensInput) {
    inputs.push({
      id: 'maxTokens' as PortId,
      title: 'Max output tokens',
      dataType: 'number',
    });
  }

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
