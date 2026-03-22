import type { EditorDefinition } from '../EditorDefinition.js';
import type { ChartNode, NodeInputDefinition, NodeOutputDefinition, PortId } from '../NodeBase.js';

export type ChatV2CommonNodeData = {
  model: string;
  useModelInput: boolean;
  temperature: number;
  useTemperatureInput: boolean;
  topP?: number;
  useTopPInput: boolean;
  topK?: number;
  useTopKInput: boolean;
  maxTokens: number;
  useMaxTokensInput: boolean;
  useToolCalling: boolean;
  outputUsage: boolean;
  cache: boolean;
  useAsGraphPartialOutput?: boolean;
};

type ChatV2SharedNode = ChartNode<string, ChatV2CommonNodeData>;

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
  includeFunctionCalls?: boolean;
  includeUsage?: boolean;
};

export function createChatV2CommonNodeData(
  overrides: Partial<ChatV2CommonNodeData> = {},
): ChatV2CommonNodeData {
  return {
    model: 'gpt-4o',
    useModelInput: false,
    temperature: 0.5,
    useTemperatureInput: false,
    topP: 1,
    useTopPInput: false,
    topK: undefined,
    useTopKInput: false,
    maxTokens: 1024,
    useMaxTokensInput: false,
    useToolCalling: false,
    outputUsage: false,
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

  if (data.useMaxTokensInput) {
    inputs.push({
      id: 'maxTokens' as PortId,
      title: 'Max Tokens',
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
    includeFunctionCalls = data.useToolCalling,
    includeUsage = data.outputUsage,
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
      title: 'Function Calls',
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

  return outputs;
}

export function getCommonChatV2Editors<T extends ChatV2SharedNode>(
  modelOptions: { value: string; label: string }[],
): EditorDefinition<T>[] {
  const editors = [
    {
      type: 'dropdown',
      label: 'Model',
      dataKey: 'model',
      useInputToggleDataKey: 'useModelInput',
      options: modelOptions,
    },
    {
      type: 'group',
      label: 'Parameters',
      editors: [
        {
          type: 'number',
          label: 'Temperature',
          dataKey: 'temperature',
          useInputToggleDataKey: 'useTemperatureInput',
          min: 0,
          max: 2,
          step: 0.1,
        },
        {
          type: 'number',
          label: 'Top P',
          dataKey: 'topP',
          useInputToggleDataKey: 'useTopPInput',
          allowEmpty: true,
          min: 0,
          max: 1,
          step: 0.1,
        },
        {
          type: 'number',
          label: 'Top K',
          dataKey: 'topK',
          useInputToggleDataKey: 'useTopKInput',
          allowEmpty: true,
          min: 1,
          step: 1,
        },
        {
          type: 'number',
          label: 'Max Tokens',
          dataKey: 'maxTokens',
          useInputToggleDataKey: 'useMaxTokensInput',
          min: 1,
          step: 1,
        },
      ],
    },
    {
      type: 'group',
      label: 'Outputs',
      editors: [
        {
          type: 'toggle',
          label: 'Enable Tool Calling',
          dataKey: 'useToolCalling',
        },
        {
          type: 'toggle',
          label: 'Output Usage',
          dataKey: 'outputUsage',
        },
        {
          type: 'toggle',
          label: 'Use As Graph Partial Output',
          dataKey: 'useAsGraphPartialOutput',
        },
      ],
    },
  ] satisfies EditorDefinition<ChatV2SharedNode>[];

  return editors as unknown as EditorDefinition<T>[];
}
