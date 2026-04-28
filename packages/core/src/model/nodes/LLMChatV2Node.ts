import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { nanoid } from 'nanoid/non-secure';
import { dedent } from 'ts-dedent';
import { coerceTypeOptional } from '../../utils/coerceType.js';
import { cleanHeaders, getInputOrData } from '../../utils/inputs.js';
import type { EditorDefinition } from '../EditorDefinition.js';
import type { Inputs, Outputs } from '../GraphProcessor.js';
import { NodeImpl, type NodeUIData } from '../NodeImpl.js';
import { nodeDefinition } from '../NodeDefinition.js';
import type { ChartNode, NodeId, NodeInputDefinition, NodeOutputDefinition, PortId } from '../NodeBase.js';
import type { InternalProcessContext } from '../ProcessContext.js';
import { createChatV2CommonNodeData, getCommonChatV2Inputs, getCommonChatV2Outputs, type ChatV2CommonNodeData } from '../chat-v2/chatV2Shared.js';
import { runChatV2Pipeline } from '../chat-v2/chatV2Pipeline.js';
import { runChatV2PipelineWithToolContinuation } from '../chat-v2/toolContinuation.js';
import {
  anthropicCacheControlTtlOptions,
  anthropicEffortOptions,
  anthropicThinkingModeOptions,
  createChatV2ResponseOutput,
  chatV2ProviderOptions,
  createChatV2Model,
  getChatV2ModelInfo,
  getChatV2ModelOptions,
  getChatV2ProviderLabel,
  googleThinkingLevelOptions,
  openAIReasoningEffortOptions,
  openAIWebSearchContextSizeOptions,
  parseChatV2Provider,
  resolveChatV2ResponseFormatParameters,
  resolveChatV2ProviderConfig,
} from '../chat-v2/index.js';
import type { ChatV2Provider, ChatV2ProviderOptions, ChatV2ToolChoice, ChatV2ToolSet } from '../chat-v2/chatV2Types.js';
import type { ChatV2ResponseFormat } from '../chat-v2/chatV2ResponseFormat.js';
import type { GptFunction } from '../DataValue.js';
import { delegateToolCall } from './toolCallDelegation.js';

type LLMChatV2ToolChoiceMode = '' | 'auto' | 'function' | 'required';

export type LLMChatV2NodeConfigData = ChatV2CommonNodeData & {
  provider: ChatV2Provider;
  baseURL: string;
  useBaseURLInput: boolean;
  headers: { key: string; value: string }[];
  useHeadersInput: boolean;
  openAIReasoningEffort: string;
  openAIReasoningSummary: string;
  openAIPreviousResponseId: string;
  useOpenAIPreviousResponseIdInput: boolean;
  enableOpenAIWebSearch: boolean;
  openAIWebSearchContextSize: 'low' | 'medium' | 'high';
  enableOpenAICodeInterpreter: boolean;
  anthropicThinkingMode: '' | 'adaptive' | 'enabled' | 'disabled';
  anthropicThinkingBudget?: number;
  useAnthropicThinkingBudgetInput: boolean;
  anthropicEffort?: '' | 'low' | 'medium' | 'high' | 'max';
  anthropicCacheControlTtl: '' | '5m' | '1h';
  googleThinkingBudget?: number;
  useGoogleThinkingBudgetInput: boolean;
  googleThinkingLevel?: '' | 'minimal' | 'low' | 'medium' | 'high';
  googleIncludeThoughts?: boolean;
  googleStructuredOutputs: boolean;
  enableGoogleSearchGrounding: boolean;
  enableGoogleUrlContext: boolean;
  responseFormat?: ChatV2ResponseFormat;
  responseSchemaName?: string;
  useResponseSchemaNameInput?: boolean;
  responseSchemaDescription?: string;
  useResponseSchemaDescriptionInput?: boolean;
  toolChoice?: LLMChatV2ToolChoiceMode;
  toolChoiceFunction?: string;
  parallelToolCalls?: boolean;
  autoContinueToolCalls?: boolean;
  maxToolRounds?: number;
};

export type LLMChatV2NodeData = LLMChatV2NodeConfigData;
export type LLMChatV2Node = ChartNode<'llmChatV2', LLMChatV2NodeData>;

function hasBuiltInToolsEnabled(data: LLMChatV2NodeData): boolean {
  return (
    (data.provider === 'openai' && (data.enableOpenAIWebSearch || data.enableOpenAICodeInterpreter)) ||
    (data.provider === 'google' && (data.enableGoogleSearchGrounding || data.enableGoogleUrlContext))
  );
}

function resolveHeaders(data: LLMChatV2NodeData, inputs: Inputs): Record<string, string> | undefined {
  const resolvedHeaders =
    data.useHeadersInput && inputs['headers' as PortId] != null
      ? (coerceTypeOptional(inputs['headers' as PortId], 'object') as Record<string, string> | undefined)
      : Object.fromEntries((data.headers ?? []).map(({ key, value }) => [key, value]));

  const cleaned = cleanHeaders(resolvedHeaders ?? {});
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function getProviderOptions(data: LLMChatV2NodeData, inputs: Inputs): ChatV2ProviderOptions | undefined {
  const providerOptions: ChatV2ProviderOptions = {};

  if (data.provider === 'openai') {
    const previousResponseId =
      data.useOpenAIPreviousResponseIdInput && inputs['previousResponseId' as PortId] != null
        ? coerceTypeOptional(inputs['previousResponseId' as PortId], 'string')
        : data.openAIPreviousResponseId;

    const openAIOptions = {
      ...(data.openAIReasoningEffort ? { reasoningEffort: data.openAIReasoningEffort } : {}),
      ...(data.openAIReasoningSummary ? { reasoningSummary: data.openAIReasoningSummary } : {}),
      ...(previousResponseId?.trim() ? { previousResponseId: previousResponseId.trim() } : {}),
    };

    if (Object.keys(openAIOptions).length > 0) {
      providerOptions.openai = openAIOptions;
    }
  }

  if (data.provider === 'anthropic') {
    const thinkingBudget =
      data.useAnthropicThinkingBudgetInput && inputs['anthropicThinkingBudget' as PortId] != null
        ? coerceTypeOptional(inputs['anthropicThinkingBudget' as PortId], 'number')
        : data.anthropicThinkingBudget;

    const anthropicOptions = {
      ...(data.anthropicEffort ? { effort: data.anthropicEffort } : {}),
      ...(data.anthropicThinkingMode === 'enabled'
        ? {
            thinking: {
              type: 'enabled',
              ...(thinkingBudget != null ? { budgetTokens: thinkingBudget } : {}),
            },
          }
        : data.anthropicThinkingMode === 'disabled'
          ? { thinking: { type: 'disabled' } }
          : data.anthropicThinkingMode === 'adaptive'
            ? { thinking: { type: 'adaptive' } }
            : {}),
    };

    if (Object.keys(anthropicOptions).length > 0) {
      providerOptions.anthropic = anthropicOptions;
    }
  }

  if (data.provider === 'google') {
    const thinkingBudget =
      data.useGoogleThinkingBudgetInput && inputs['googleThinkingBudget' as PortId] != null
        ? coerceTypeOptional(inputs['googleThinkingBudget' as PortId], 'number')
        : data.googleThinkingBudget;

    const thinkingConfig = {
      ...(thinkingBudget != null ? { thinkingBudget } : {}),
      ...(data.googleThinkingLevel ? { thinkingLevel: data.googleThinkingLevel } : {}),
      ...(data.googleIncludeThoughts ? { includeThoughts: true } : {}),
    };
    const googleOptions = {
      ...(Object.keys(thinkingConfig).length > 0 ? { thinkingConfig } : {}),
      ...(data.googleStructuredOutputs ? { structuredOutputs: true } : {}),
    };

    if (Object.keys(googleOptions).length > 0) {
      providerOptions.google = googleOptions;
    }
  }

  return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
}

export function resolveLLMChatV2RuntimeProviderOptions(
  data: LLMChatV2NodeData,
  inputs: Inputs,
): ChatV2ProviderOptions | undefined {
  const providerOptions = getProviderOptions(data, inputs) ?? {};

  if (data.provider === 'openai' && data.useToolCalling) {
    providerOptions.openai = {
      ...(providerOptions.openai ?? {}),
      parallelToolCalls: !!data.parallelToolCalls,
    };
  }

  return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
}

function resolveToolChoice(data: LLMChatV2NodeData): ChatV2ToolChoice | undefined {
  if (!data.useToolCalling || !data.toolChoice) {
    return undefined;
  }

  if (data.toolChoice === 'function') {
    const toolName = data.toolChoiceFunction?.trim();

    if (!toolName) {
      throw new Error('Tool name is required when Tool choice is Specific tool.');
    }

    return {
      type: 'tool',
      toolName,
    } as ChatV2ToolChoice;
  }

  return data.toolChoice;
}

function normalizeStopSequences(stopSequences: string[] | undefined): string[] | undefined {
  const normalized = (stopSequences ?? []).filter((sequence) => sequence.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function resolveStopSequences(data: LLMChatV2NodeData, inputs: Inputs): string[] | undefined {
  const stopSequences =
    data.useStopSequencesInput && inputs['stopSequences' as PortId] != null
      ? coerceTypeOptional(inputs['stopSequences' as PortId], 'string[]')
      : data.stopSequences;

  return normalizeStopSequences(stopSequences);
}

function getBuiltInTools(
  data: LLMChatV2NodeData,
  context: Pick<InternalProcessContext, 'getPluginConfig' | 'settings'>,
  config: { baseURL?: string | undefined; headers?: Record<string, string> | undefined },
): ChatV2ToolSet | undefined {
  switch (data.provider) {
    case 'openai': {
      if (!data.enableOpenAIWebSearch && !data.enableOpenAICodeInterpreter) {
        return undefined;
      }

      const provider = createOpenAI({
        apiKey: context.settings.openAiKey || undefined,
        organization: context.settings.openAiOrganization || undefined,
        baseURL: config.baseURL,
        headers: config.headers,
      });
      const tools: ChatV2ToolSet = {};

      if (data.enableOpenAIWebSearch) {
        tools.openaiWebSearch = provider.tools.webSearch({
          searchContextSize: data.openAIWebSearchContextSize,
        });
      }

      if (data.enableOpenAICodeInterpreter) {
        tools.openaiCodeInterpreter = provider.tools.codeInterpreter();
      }

      return tools;
    }

    case 'google': {
      if (!data.enableGoogleSearchGrounding && !data.enableGoogleUrlContext) {
        return undefined;
      }

      const provider = createGoogleGenerativeAI({
        apiKey: context.getPluginConfig('googleApiKey') || undefined,
        baseURL: config.baseURL,
        headers: config.headers,
      });
      const tools: ChatV2ToolSet = {};

      if (data.enableGoogleSearchGrounding) {
        tools.googleSearch = provider.tools.googleSearch({});
      }

      if (data.enableGoogleUrlContext) {
        tools.googleUrlContext = provider.tools.urlContext({});
      }

      return tools;
    }

    case 'anthropic':
      return undefined;
  }
}

export class LLMChatV2NodeImpl extends NodeImpl<LLMChatV2Node> {
  static create(): LLMChatV2Node {
    const chartNode: LLMChatV2Node = {
      type: 'llmChatV2',
      title: 'LLM Chat v2',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 260,
      },
      data: {
        ...createChatV2CommonNodeData({
          model: 'gpt-5',
        }),
        provider: 'openai',
        baseURL: '',
        useBaseURLInput: false,
        headers: [],
        useHeadersInput: false,
        openAIReasoningEffort: '',
        openAIReasoningSummary: '',
        openAIPreviousResponseId: '',
        useOpenAIPreviousResponseIdInput: false,
        enableOpenAIWebSearch: false,
        openAIWebSearchContextSize: 'medium',
        enableOpenAICodeInterpreter: false,
        anthropicThinkingMode: '',
        anthropicThinkingBudget: undefined,
        useAnthropicThinkingBudgetInput: false,
        anthropicEffort: '',
        anthropicCacheControlTtl: '',
        googleThinkingBudget: undefined,
        useGoogleThinkingBudgetInput: false,
        googleThinkingLevel: '',
        googleIncludeThoughts: false,
        googleStructuredOutputs: false,
        enableGoogleSearchGrounding: false,
        enableGoogleUrlContext: false,
        responseFormat: '',
        responseSchemaName: '',
        useResponseSchemaNameInput: false,
        responseSchemaDescription: '',
        useResponseSchemaDescriptionInput: false,
        toolChoice: '',
        toolChoiceFunction: '',
        parallelToolCalls: false,
        autoContinueToolCalls: false,
        maxToolRounds: 3,
      },
    };

    return chartNode;
  }

  getInputDefinitions(): NodeInputDefinition[] {
    const inputs = getCommonChatV2Inputs(this.data, {
      includeFunctions: this.data.useToolCalling,
    });

    if (this.data.useBaseURLInput) {
      inputs.unshift({
        id: 'baseURL' as PortId,
        title: 'Base URL',
        dataType: 'string',
        required: false,
      });
    }

    if (this.data.useHeadersInput) {
      inputs.push({
        id: 'headers' as PortId,
        title: 'Headers',
        dataType: 'object',
        required: false,
      });
    }

    if (this.data.provider === 'openai' && this.data.useOpenAIPreviousResponseIdInput) {
      inputs.push({
        id: 'previousResponseId' as PortId,
        title: 'Previous Response ID',
        dataType: 'string',
        required: false,
      });
    }

    if (this.data.provider === 'anthropic' && this.data.useAnthropicThinkingBudgetInput) {
      inputs.push({
        id: 'anthropicThinkingBudget' as PortId,
        title: 'Thinking Budget',
        dataType: 'number',
        required: false,
      });
    }

    if (this.data.provider === 'google' && this.data.useGoogleThinkingBudgetInput) {
      inputs.push({
        id: 'googleThinkingBudget' as PortId,
        title: 'Thinking Budget',
        dataType: 'number',
        required: false,
      });
    }

    if (this.data.responseFormat === 'json_schema') {
      inputs.push({
        id: 'responseSchema' as PortId,
        title: 'Response Schema',
        dataType: ['object', 'gpt-function'] as const,
        required: true,
        coerced: true,
      });
    }

    if (
      (this.data.responseFormat === 'json' || this.data.responseFormat === 'json_schema') &&
      this.data.useResponseSchemaNameInput
    ) {
      inputs.push({
        id: 'responseSchemaName' as PortId,
        title: 'Schema Name',
        dataType: 'string',
        required: false,
      });
    }

    if (
      (this.data.responseFormat === 'json' || this.data.responseFormat === 'json_schema') &&
      this.data.useResponseSchemaDescriptionInput
    ) {
      inputs.push({
        id: 'responseSchemaDescription' as PortId,
        title: 'Schema Description',
        dataType: 'string',
        required: false,
      });
    }

    return inputs;
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    return getCommonChatV2Outputs(this.data, {
      includeFunctionCalls: this.data.useToolCalling || hasBuiltInToolsEnabled(this.data),
      includeUsage: this.data.outputUsage,
    });
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Vendor-agnostic chat node built on the Vercel AI SDK.

        Choose OpenAI, Anthropic, or Google inside the node without rewiring the graph.
        Common behavior stays shared; provider-specific settings only appear in advanced sections when relevant.
      `,
      contextMenuTitle: 'LLM Chat v2',
      infoBoxTitle: 'LLM Chat v2 Node',
      group: ['Common', 'AI'],
    };
  }

  async getEditors(context: import('../RivetUIContext.js').RivetUIContext): Promise<EditorDefinition<LLMChatV2Node>[]> {
    const modelOptions =
      (await context.getChatModelOptions?.(this.data.provider).catch(() => undefined)) ??
      getChatV2ModelOptions(this.data.provider);
    const resolvedModelOptions = modelOptions.some((option) => option.value === this.data.model)
      ? modelOptions
      : [{ value: this.data.model, label: `${this.data.model} (Current)` }, ...modelOptions];

    return [
      {
        type: 'group',
        label: 'Model',
        defaultOpen: true,
        editors: [
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
            options: resolvedModelOptions,
          },
          {
            type: 'custom',
            label: 'Model Catalog',
            customEditorId: 'LLMChatV2ModelCatalog',
          },
        ],
      },
      {
        type: 'group',
        label: 'Parameters',
        defaultOpen: true,
        editors: [
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
      },
      {
        type: 'group',
        label: 'Reasoning',
        editors: [
          {
            type: 'dropdown',
            label: 'Reasoning effort',
            dataKey: 'openAIReasoningEffort',
            options: openAIReasoningEffortOptions,
            helperMessage:
              'OpenAI-compatible Vercel provider option for reasoning models. Some models only support a subset of effort levels.',
            hideIf: (data) => data.provider !== 'openai',
          },
          {
            type: 'string',
            label: 'Reasoning summary',
            dataKey: 'openAIReasoningSummary',
            placeholder: 'auto, detailed, concise...',
            helperMessage:
              'OpenAI-compatible Vercel provider option that asks reasoning models to include a reasoning summary when supported.',
            hideIf: (data) => data.provider !== 'openai',
          },
          {
            type: 'dropdown',
            label: 'Thinking mode',
            dataKey: 'anthropicThinkingMode',
            options: anthropicThinkingModeOptions,
            helperMessage: 'Anthropic Vercel provider option for Claude extended thinking.',
            hideIf: (data) => data.provider !== 'anthropic',
          },
          {
            type: 'dropdown',
            label: 'Effort',
            dataKey: 'anthropicEffort',
            options: anthropicEffortOptions,
            helperMessage:
              'Anthropic provider option for newer Claude models. It affects thinking, text responses, and tool calls when supported.',
            hideIf: (data) => data.provider !== 'anthropic',
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
            hideIf: (data) => data.provider !== 'google',
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
            hideIf: (data) => data.provider !== 'google',
          },
          {
            type: 'toggle',
            label: 'Include thoughts',
            dataKey: 'googleIncludeThoughts',
            helperMessage: 'Requests Google reasoning summaries when supported by the selected model.',
            hideIf: (data) => data.provider !== 'google',
          },
        ],
      },
      {
        type: 'group',
        label: 'Response format',
        editors: [
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
        ],
      },
      {
        type: 'group',
        label: 'Tools',
        editors: [
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
            helperMessage:
              'Controls whether the model may call tools. Default lets the model/provider choose.',
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
        ],
      },
      {
        type: 'group',
        label: 'Outputs',
        editors: [
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
          {
            type: 'toggle',
            label: 'Cache (same inputs, same outputs)',
            dataKey: 'cache',
          },
        ],
      },
      {
        type: 'group',
        label: 'Provider Advanced',
        editors: [
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
        ],
      },
      {
        type: 'group',
        label: 'OpenAI',
        hideIf: (data) => data.provider !== 'openai',
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
        hideIf: (data) => data.provider !== 'anthropic',
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
        hideIf: (data) => data.provider !== 'google',
        editors: [
          {
            type: 'toggle',
            label: 'Structured Outputs',
            dataKey: 'googleStructuredOutputs',
          },
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

  getBody() {
    const modelInfo = getChatV2ModelInfo(this.data.provider, this.data.model);
    const providerLabel = getChatV2ProviderLabel(this.data.provider);

    return dedent`
      ${providerLabel}
      ${modelInfo?.displayName ?? this.data.model}
      Temperature: ${this.data.useTemperatureInput ? '(Using Input)' : this.data.temperature}
      Max output tokens: ${this.data.useMaxTokensInput ? '(Using Input)' : this.data.maxTokens}
    `;
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    const provider = parseChatV2Provider(this.data.provider);
    const modelId = getInputOrData(this.data, inputs, 'model', 'string');
    const baseURL = getInputOrData(this.data, inputs, 'baseURL', 'string', 'useBaseURLInput')?.trim() || undefined;
    const nodeHeaders = resolveHeaders(this.data, inputs);
    const providerConfig = await resolveChatV2ProviderConfig(provider, modelId, context, {
      baseURL,
      headers: nodeHeaders,
    });
    const model = createChatV2Model(provider, modelId, context, providerConfig);
    const prompt = inputs['prompt' as PortId];
    const systemPrompt = inputs['systemPrompt' as PortId];
    const functions =
      this.data.useToolCalling && inputs['functions' as PortId] != null
        ? (coerceTypeOptional(inputs['functions' as PortId], 'gpt-function[]') as GptFunction[] | undefined)
        : undefined;
    const builtInTools = getBuiltInTools(this.data, context, providerConfig);
    const toolChoice = resolveToolChoice(this.data);
    const responseFormatParameters = resolveChatV2ResponseFormatParameters(this.data, inputs);
    const generationParameters = {
      maxTokens: getInputOrData(this.data, inputs, 'maxTokens', 'number'),
      temperature: getInputOrData(this.data, inputs, 'temperature', 'number'),
      topP: getInputOrData(this.data, inputs, 'topP', 'number'),
      topK: getInputOrData(this.data, inputs, 'topK', 'number'),
      presencePenalty: getInputOrData(this.data, inputs, 'presencePenalty', 'number'),
      frequencyPenalty: getInputOrData(this.data, inputs, 'frequencyPenalty', 'number'),
      stopSequences: resolveStopSequences(this.data, inputs),
      seed: getInputOrData(this.data, inputs, 'seed', 'number'),
    };
    const responseOutput = createChatV2ResponseOutput(responseFormatParameters);

    const cacheKey =
      this.data.cache
        ? JSON.stringify({
            nodeData: this.data,
            provider,
            modelId,
            providerConfig,
            prompt,
            systemPrompt,
            functions,
            generationParameters,
            responseFormatParameters,
            providerOptions: resolveLLMChatV2RuntimeProviderOptions(this.data, inputs),
            toolChoice,
          })
        : undefined;

    const cachedOutputs =
      cacheKey != null ? (context.executionCache.get(cacheKey) as Outputs | undefined) : undefined;

    if (cachedOutputs != null) {
      return cachedOutputs;
    }

    const providerOptions = resolveLLMChatV2RuntimeProviderOptions(this.data, inputs);
    const includeFunctionCalls = this.data.useToolCalling || hasBuiltInToolsEnabled(this.data);
    const runOptions = {
      provider,
      model,
      modelId,
      prompt,
      systemPrompt,
      functions,
      additionalTools: builtInTools,
      ...generationParameters,
      responseOutput,
      outputUsage: this.data.outputUsage,
      includeFunctionCalls,
      emitPartialOutputs: this.data.useAsGraphPartialOutput,
      providerOptions,
      toolChoice,
      anthropicCacheControlTtl: provider === 'anthropic' ? this.data.anthropicCacheControlTtl || undefined : undefined,
      context,
    };
    const result = this.data.autoContinueToolCalls && this.data.useToolCalling
      ? await runChatV2PipelineWithToolContinuation({
          ...runOptions,
          autoContinue: true,
          maxToolRounds: this.data.maxToolRounds ?? 3,
          functions,
          delegateToolCall: async (toolCall) => {
            const delegated = await delegateToolCall(toolCall, context, {
              handlers: [],
              unknownHandler: undefined,
              autoDelegate: true,
              fallBackToExternalCall: true,
              passthroughErrors: true,
            });

            return {
              type: 'chat-message',
              value: delegated.message,
              delegatedToolCall: delegated.record,
            };
          },
        })
      : await runChatV2Pipeline(runOptions);

    if (cacheKey != null) {
      context.executionCache.set(cacheKey, result.commonOutputs);
    }

    return result.commonOutputs;
  }
}

export const llmChatV2Node = nodeDefinition(LLMChatV2NodeImpl, 'LLM Chat v2');
