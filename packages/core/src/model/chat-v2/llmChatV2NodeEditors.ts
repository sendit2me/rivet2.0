import type { EditorDefinition } from '../EditorDefinition.js';
import type { RivetUIContext } from '../RivetUIContext.js';
import {
  anthropicCacheControlTtlOptions,
  anthropicEffortOptions,
  anthropicThinkingModeOptions,
  chatV2ProviderOptions,
  getChatV2ModelOptions,
  googleThinkingLevelOptions,
  openAIReasoningEffortOptions,
  openAIWebSearchContextSizeOptions,
} from './providerOptions.js';
import type { LLMChatV2Node, LLMChatV2NodeData } from './llmChatV2NodeData.js';

type LLMChatV2EditorDefinition = EditorDefinition<LLMChatV2Node>;

const hideUnlessProvider =
  (provider: LLMChatV2NodeData['provider']) =>
  (data: LLMChatV2NodeData): boolean =>
    data.provider !== provider;

function group(label: string, editors: LLMChatV2EditorDefinition[], defaultOpen?: boolean): LLMChatV2EditorDefinition {
  return {
    type: 'group',
    label,
    ...(defaultOpen != null ? { defaultOpen } : {}),
    editors,
  };
}

async function getResolvedModelOptions(data: LLMChatV2NodeData, context: RivetUIContext) {
  const modelOptions =
    (await context.getChatModelOptions?.(data.provider).catch(() => undefined)) ?? getChatV2ModelOptions(data.provider);

  return modelOptions.some((option) => option.value === data.model)
    ? modelOptions
    : [{ value: data.model, label: `${data.model} (Current)` }, ...modelOptions];
}

function getModelEditors(modelOptions: { value: string; label: string }[]): LLMChatV2EditorDefinition {
  return group(
    'Model',
    [
      {
        type: 'dropdown',
        label: 'Provider',
        dataKey: 'provider',
        options: [...chatV2ProviderOptions],
      },
      {
        type: 'dropdown',
        label: 'Model',
        dataKey: 'model',
        useInputToggleDataKey: 'useModelInput',
        options: modelOptions,
      },
      {
        type: 'custom',
        label: 'Model Catalog',
        customEditorId: 'LLMChatV2ModelCatalog',
      },
      {
        type: 'segmented',
        label: 'API key source',
        ariaLabel: 'API key source',
        dataKey: 'apiKeySource',
        defaultValue: 'environment',
        options: [
          { value: 'environment', label: 'Configured key' },
          { value: 'input', label: 'Input port' },
        ],
        helperMessage: 'Whether to use the configured provider API key or get one through an input port.',
      },
    ],
    true,
  );
}

function getProviderEditors(): LLMChatV2EditorDefinition[] {
  return [
    {
      type: 'group',
      label: 'OpenAI',
      hideIf: hideUnlessProvider('openai'),
      editors: [
        {
          type: 'string',
          label: 'Previous Response ID',
          dataKey: 'openAIPreviousResponseId',
          useInputToggleDataKey: 'useOpenAIPreviousResponseIdInput',
        },
        {
          type: 'toggle',
          label: 'Enable Web Search',
          dataKey: 'enableOpenAIWebSearch',
        },
        {
          type: 'dropdown',
          label: 'Web Search Context',
          dataKey: 'openAIWebSearchContextSize',
          options: openAIWebSearchContextSizeOptions,
          hideIf: (data) => !data.enableOpenAIWebSearch,
        },
        {
          type: 'toggle',
          label: 'Enable Code Interpreter',
          dataKey: 'enableOpenAICodeInterpreter',
        },
      ],
    },
    {
      type: 'group',
      label: 'Anthropic',
      hideIf: hideUnlessProvider('anthropic'),
      editors: [
        {
          type: 'dropdown',
          label: 'Cache Breakpoint TTL',
          dataKey: 'anthropicCacheControlTtl',
          options: anthropicCacheControlTtlOptions,
          helperMessage: 'Applies when incoming chat messages mark a cache breakpoint.',
        },
      ],
    },
    {
      type: 'group',
      label: 'Google',
      hideIf: hideUnlessProvider('google'),
      editors: [
        {
          type: 'toggle',
          label: 'Enable Google Search Grounding',
          dataKey: 'enableGoogleSearchGrounding',
        },
        {
          type: 'toggle',
          label: 'Enable URL Context',
          dataKey: 'enableGoogleUrlContext',
        },
      ],
    },
  ];
}

function getParameterEditors(): LLMChatV2EditorDefinition {
  return group(
    'Parameters',
    [
      {
        type: 'number',
        label: 'Temperature',
        helperMessage: 'Provider-dependent; some reasoning models may ignore this setting.',
        dataKey: 'temperature',
        useInputToggleDataKey: 'useTemperatureInput',
        min: 0,
        max: 2,
        step: 0.1,
      },
      {
        type: 'number',
        label: 'Max output tokens',
        dataKey: 'maxTokens',
        useInputToggleDataKey: 'useMaxTokensInput',
        min: 1,
        step: 1,
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
        helperMessage: 'Provider-dependent; some providers or models may ignore this setting.',
        dataKey: 'topK',
        useInputToggleDataKey: 'useTopKInput',
        allowEmpty: true,
        min: 1,
        step: 1,
      },
      {
        type: 'number',
        label: 'Presence penalty',
        dataKey: 'presencePenalty',
        useInputToggleDataKey: 'usePresencePenaltyInput',
        allowEmpty: true,
        min: -1,
        max: 1,
        step: 0.1,
      },
      {
        type: 'number',
        label: 'Frequency penalty',
        dataKey: 'frequencyPenalty',
        useInputToggleDataKey: 'useFrequencyPenaltyInput',
        allowEmpty: true,
        min: -1,
        max: 1,
        step: 0.1,
      },
      {
        type: 'stringList',
        label: 'Stop sequences',
        dataKey: 'stopSequences',
        useInputToggleDataKey: 'useStopSequencesInput',
        placeholder: 'Stop sequence',
        newItemDefault: '',
      },
      {
        type: 'number',
        label: 'Seed',
        dataKey: 'seed',
        useInputToggleDataKey: 'useSeedInput',
        allowEmpty: true,
        min: 0,
        step: 1,
      },
    ],
    true,
  );
}

function getReasoningEditors(): LLMChatV2EditorDefinition {
  return group('Reasoning', [
    {
      type: 'dropdown',
      label: 'Reasoning effort',
      dataKey: 'openAIReasoningEffort',
      options: openAIReasoningEffortOptions,
      helperMessage:
        'OpenAI-compatible Vercel provider option for reasoning models. Some models only support a subset of effort levels.',
      hideIf: hideUnlessProvider('openai'),
    },
    {
      type: 'string',
      label: 'Reasoning summary',
      dataKey: 'openAIReasoningSummary',
      placeholder: 'auto, detailed, concise...',
      helperMessage:
        'OpenAI-compatible Vercel provider option that asks reasoning models to include a reasoning summary when supported.',
      hideIf: hideUnlessProvider('openai'),
    },
    {
      type: 'dropdown',
      label: 'Thinking mode',
      dataKey: 'anthropicThinkingMode',
      options: anthropicThinkingModeOptions,
      helperMessage: 'Anthropic Vercel provider option for Claude extended thinking.',
      hideIf: hideUnlessProvider('anthropic'),
    },
    {
      type: 'dropdown',
      label: 'Effort',
      dataKey: 'anthropicEffort',
      options: anthropicEffortOptions,
      helperMessage:
        'Anthropic provider option for newer Claude models. It affects thinking, text responses, and tool calls when supported.',
      hideIf: hideUnlessProvider('anthropic'),
    },
    {
      type: 'number',
      label: 'Thinking budget',
      dataKey: 'anthropicThinkingBudget',
      useInputToggleDataKey: 'useAnthropicThinkingBudgetInput',
      allowEmpty: true,
      step: 1,
      min: 0,
      helperMessage: 'Optional token budget for Anthropic extended thinking when thinking mode is enabled.',
      hideIf: (data) => data.provider !== 'anthropic' || data.anthropicThinkingMode !== 'enabled',
    },
    {
      type: 'dropdown',
      label: 'Thinking level',
      dataKey: 'googleThinkingLevel',
      options: googleThinkingLevelOptions,
      helperMessage: 'Google provider option for Gemini 3 thinking depth when supported by the selected model.',
      hideIf: hideUnlessProvider('google'),
    },
    {
      type: 'number',
      label: 'Thinking budget',
      dataKey: 'googleThinkingBudget',
      useInputToggleDataKey: 'useGoogleThinkingBudgetInput',
      allowEmpty: true,
      step: 1,
      min: 0,
      helperMessage: 'Google provider option for Gemini 2.5 thinking budget when supported by the selected model.',
      hideIf: hideUnlessProvider('google'),
    },
    {
      type: 'toggle',
      label: 'Include thoughts',
      dataKey: 'googleIncludeThoughts',
      helperMessage: 'Requests Google reasoning summaries when supported by the selected model.',
      hideIf: hideUnlessProvider('google'),
    },
  ]);
}

function getResponseFormatEditors(): LLMChatV2EditorDefinition {
  return group('Response format', [
    {
      type: 'dropdown',
      label: 'Response format',
      dataKey: 'responseFormat',
      options: [
        { value: '', label: 'Default' },
        { value: 'text', label: 'Text' },
        { value: 'json', label: 'JSON' },
        { value: 'json_schema', label: 'JSON schema' },
      ],
      defaultValue: '',
      helperMessage:
        'Uses Vercel AI SDK structured-output response formatting when supported by the provider. JSON schema adds a Response Schema input port.',
    },
    {
      type: 'string',
      label: 'Schema name',
      dataKey: 'responseSchemaName',
      useInputToggleDataKey: 'useResponseSchemaNameInput',
      placeholder: 'response_schema',
      helperMessage: 'Optional name passed to the provider for JSON or JSON schema responses.',
      hideIf: (data) => data.responseFormat !== 'json' && data.responseFormat !== 'json_schema',
    },
    {
      type: 'string',
      label: 'Schema description',
      dataKey: 'responseSchemaDescription',
      useInputToggleDataKey: 'useResponseSchemaDescriptionInput',
      helperMessage: 'Optional description passed to the provider for JSON or JSON schema responses.',
      hideIf: (data) => data.responseFormat !== 'json' && data.responseFormat !== 'json_schema',
    },
  ]);
}

function getToolEditors(): LLMChatV2EditorDefinition {
  return group('Tools', [
    {
      type: 'toggle',
      label: 'Tool use',
      dataKey: 'useToolCalling',
    },
    {
      type: 'dropdown',
      label: 'Tool choice',
      dataKey: 'toolChoice',
      options: [
        { value: '', label: 'Default' },
        { value: 'auto', label: 'Auto' },
        { value: 'function', label: 'Specific tool' },
        { value: 'required', label: 'Required' },
      ],
      defaultValue: '',
      helperMessage: 'Controls whether the model may call tools. Default lets the model/provider choose.',
      hideIf: (data) => !data.useToolCalling,
    },
    {
      type: 'string',
      label: 'Tool name',
      dataKey: 'toolChoiceFunction',
      helperMessage: 'The name of the tool to force the model to call.',
      hideIf: (data) => !data.useToolCalling || data.toolChoice !== 'function',
    },
    {
      type: 'toggle',
      label: 'Allow parallel toolcalls',
      dataKey: 'parallelToolCalls',
      hideIf: (data) => !data.useToolCalling,
    },
    {
      type: 'toggle',
      label: 'Auto-continue after toolcalls run',
      dataKey: 'autoContinueToolCalls',
      helperMessage:
        'When the model calls tools, Rivet runs them, sends all tool results back to the model, and repeats until a normal answer is produced or max rounds is reached.',
      hideIf: (data) => !data.useToolCalling,
    },
    {
      type: 'number',
      label: 'Max tool rounds',
      dataKey: 'maxToolRounds',
      min: 1,
      step: 1,
      hideIf: (data) => !data.useToolCalling || !data.autoContinueToolCalls,
    },
  ]);
}

function getOutputEditors(): LLMChatV2EditorDefinition {
  return group('Outputs', [
    {
      type: 'toggle',
      label: 'Output usage details',
      dataKey: 'outputUsage',
      helperMessage:
        'Adds a Usage output built from Vercel AI SDK usage metadata: prompt, completion, total, cached, reasoning tokens, and estimated cost when available.',
    },
    {
      type: 'toggle',
      label: 'Stream response',
      dataKey: 'useAsGraphPartialOutput',
      helperMessage:
        'Shows streamed response updates in the node output while running in the editor. Other nodes only receive the final response after it is complete.',
    },
    {
      type: 'toggle',
      label: 'Cache outputs (editor only)',
      dataKey: 'cache',
      helperMessage:
        "Reuses this node's previous outputs if the input is the same (provider config, prompt and generation settings). The cache persists while the Rivet app is open.",
    },
  ]);
}

function getProviderAdvancedEditors(): LLMChatV2EditorDefinition {
  return group('Provider Advanced', [
    {
      type: 'string',
      label: 'Base URL',
      dataKey: 'baseURL',
      useInputToggleDataKey: 'useBaseURLInput',
      placeholder: 'Optional provider base URL override',
    },
    {
      type: 'keyValuePair',
      label: 'Headers',
      dataKey: 'headers',
      useInputToggleDataKey: 'useHeadersInput',
      keyPlaceholder: 'Header',
      valuePlaceholder: 'Value',
    },
  ]);
}

export async function getLLMChatV2Editors(
  data: LLMChatV2NodeData,
  context: RivetUIContext,
): Promise<EditorDefinition<LLMChatV2Node>[]> {
  return [
    getModelEditors(await getResolvedModelOptions(data, context)),
    ...getProviderEditors(),
    getParameterEditors(),
    getReasoningEditors(),
    getResponseFormatEditors(),
    getToolEditors(),
    getOutputEditors(),
    getProviderAdvancedEditors(),
  ];
}
