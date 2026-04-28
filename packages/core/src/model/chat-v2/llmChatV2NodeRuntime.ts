import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import stableStringify from 'safe-stable-stringify';
import { coerceTypeOptional } from '../../utils/coerceType.js';
import { cleanHeaders, getInputOrData } from '../../utils/inputs.js';
import type { GptFunction } from '../DataValue.js';
import type { Inputs, Outputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';
import type { InternalProcessContext } from '../ProcessContext.js';
import {
  createChatV2Model,
  parseChatV2Provider,
  resolveChatV2ProviderConfig,
  type ResolvedChatV2ProviderConfig,
} from './providerOptions.js';
import {
  createChatV2ResponseOutput,
  resolveChatV2ResponseFormatParameters,
} from './chatV2ResponseFormat.js';
import type {
  ChatV2ProviderOptions,
  ChatV2ToolChoice,
  ChatV2ToolSet,
  RunChatV2PipelineOptions,
} from './chatV2Types.js';
import {
  type LLMChatV2EditorCacheKeyParts,
  type LLMChatV2NodeData,
  hasLLMChatV2BuiltInToolsEnabled,
} from './llmChatV2NodeData.js';

type LLMChatV2GenerationParameters = Pick<
  RunChatV2PipelineOptions,
  | 'maxTokens'
  | 'temperature'
  | 'topP'
  | 'topK'
  | 'presencePenalty'
  | 'frequencyPenalty'
  | 'stopSequences'
  | 'seed'
>;

export type LLMChatV2RuntimeConfig = {
  runOptions: RunChatV2PipelineOptions;
  functions: GptFunction[] | undefined;
  cacheKey: string | undefined;
  cachedOutputs: Outputs | undefined;
  editorCache: Map<string, unknown> | undefined;
  shouldAutoContinueToolCalls: boolean;
  maxToolRounds: number;
};

export function buildLLMChatV2EditorCacheKey(parts: LLMChatV2EditorCacheKeyParts): string {
  return stableStringify(parts) ?? '';
}

function cloneEditorCacheValue<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Uint8Array) {
    return new Uint8Array(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneEditorCacheValue(item, seen)) as T;
  }

  const existing = seen.get(value);
  if (existing != null) {
    return existing as T;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);

  for (const [key, item] of Object.entries(value)) {
    clone[key] = cloneEditorCacheValue(item, seen);
  }

  return clone as T;
}

export function cloneLLMChatV2EditorCacheOutputs(outputs: Outputs): Outputs {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(outputs) as Outputs;
    } catch {
      // Fall through to the small object/array clone for values structuredClone cannot copy.
    }
  }

  return cloneEditorCacheValue(outputs);
}

function resolveHeaders(data: LLMChatV2NodeData, inputs: Inputs): Record<string, string> | undefined {
  const resolvedHeaders =
    data.useHeadersInput && inputs['headers' as PortId] != null
      ? (coerceTypeOptional(inputs['headers' as PortId], 'object') as Record<string, string> | undefined)
      : Object.fromEntries((data.headers ?? []).map(({ key, value }) => [key, value]));

  const cleaned = cleanHeaders(resolvedHeaders ?? {});
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function resolveProviderOptions(data: LLMChatV2NodeData, inputs: Inputs): ChatV2ProviderOptions | undefined {
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
  const providerOptions = resolveProviderOptions(data, inputs) ?? {};

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

function resolveGenerationParameters(
  data: LLMChatV2NodeData,
  inputs: Inputs,
): LLMChatV2GenerationParameters {
  return {
    maxTokens: getInputOrData(data, inputs, 'maxTokens', 'number'),
    temperature: getInputOrData(data, inputs, 'temperature', 'number'),
    topP: getInputOrData(data, inputs, 'topP', 'number'),
    topK: getInputOrData(data, inputs, 'topK', 'number'),
    presencePenalty: getInputOrData(data, inputs, 'presencePenalty', 'number'),
    frequencyPenalty: getInputOrData(data, inputs, 'frequencyPenalty', 'number'),
    stopSequences: resolveStopSequences(data, inputs),
    seed: getInputOrData(data, inputs, 'seed', 'number'),
  };
}

function resolveBuiltInTools(
  data: LLMChatV2NodeData,
  context: Pick<InternalProcessContext, 'getPluginConfig' | 'settings'>,
  config: ResolvedChatV2ProviderConfig,
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

export async function resolveLLMChatV2RuntimeConfig(params: {
  data: LLMChatV2NodeData;
  nodeId: LLMChatV2EditorCacheKeyParts['nodeId'];
  inputs: Inputs;
  context: InternalProcessContext;
}): Promise<LLMChatV2RuntimeConfig> {
  const { data, nodeId, inputs, context } = params;
  const provider = parseChatV2Provider(data.provider);
  const modelId = getInputOrData(data, inputs, 'model', 'string');
  const baseURL = getInputOrData(data, inputs, 'baseURL', 'string', 'useBaseURLInput')?.trim() || undefined;
  const nodeHeaders = resolveHeaders(data, inputs);
  const providerConfig = await resolveChatV2ProviderConfig(provider, modelId, context, {
    baseURL,
    headers: nodeHeaders,
  });
  const model = createChatV2Model(provider, modelId, context, providerConfig);
  const prompt = inputs['prompt' as PortId];
  const systemPrompt = inputs['systemPrompt' as PortId];
  const functions =
    data.useToolCalling && inputs['functions' as PortId] != null
      ? (coerceTypeOptional(inputs['functions' as PortId], 'gpt-function[]') as GptFunction[] | undefined)
      : undefined;
  const providerOptions = resolveLLMChatV2RuntimeProviderOptions(data, inputs);
  const toolChoice = resolveToolChoice(data);
  const responseFormatParameters = resolveChatV2ResponseFormatParameters(data, inputs);
  const generationParameters = resolveGenerationParameters(data, inputs);
  const runOptions: RunChatV2PipelineOptions = {
    provider,
    model,
    modelId,
    prompt,
    systemPrompt,
    functions,
    additionalTools: resolveBuiltInTools(data, context, providerConfig),
    ...generationParameters,
    responseOutput: createChatV2ResponseOutput(responseFormatParameters),
    outputUsage: data.outputUsage,
    includeFunctionCalls: data.useToolCalling || hasLLMChatV2BuiltInToolsEnabled(data),
    emitPartialOutputs: data.useAsGraphPartialOutput,
    providerOptions,
    toolChoice,
    anthropicCacheControlTtl: provider === 'anthropic' ? data.anthropicCacheControlTtl || undefined : undefined,
    context,
  };

  const editorCache = data.cache ? context.editorExecutionCache : undefined;
  const cacheKey =
    editorCache != null
      ? buildLLMChatV2EditorCacheKey({
          nodeId,
          nodeData: data,
          provider,
          modelId,
          providerConfig,
          prompt,
          systemPrompt,
          functions,
          generationParameters,
          responseFormatParameters,
          providerOptions,
          toolChoice,
        })
      : undefined;

  return {
    runOptions,
    functions,
    cacheKey,
    cachedOutputs:
      cacheKey != null && editorCache != null && editorCache.has(cacheKey)
        ? cloneLLMChatV2EditorCacheOutputs(editorCache.get(cacheKey) as Outputs)
        : undefined,
    editorCache,
    shouldAutoContinueToolCalls: !!data.autoContinueToolCalls && data.useToolCalling,
    maxToolRounds: data.maxToolRounds ?? 3,
  };
}
