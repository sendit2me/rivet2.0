import { nanoid } from 'nanoid/non-secure';
import { dedent } from 'ts-dedent';
import type { EditorDefinition } from '../EditorDefinition.js';
import type { Inputs, Outputs } from '../GraphProcessor.js';
import type { NodeId, NodeInputDefinition, NodeOutputDefinition, PortId } from '../NodeBase.js';
import { nodeDefinition } from '../NodeDefinition.js';
import { NodeImpl, type NodeUIData } from '../NodeImpl.js';
import type { InternalProcessContext } from '../ProcessContext.js';
import type { RivetUIContext } from '../RivetUIContext.js';
import { getCommonChatV2Inputs, getCommonChatV2Outputs } from '../chat-v2/chatV2Shared.js';
import { getLLMChatV2Editors } from '../chat-v2/llmChatV2NodeEditors.js';
import {
  createLLMChatV2NodeData,
  hasLLMChatV2BuiltInToolsEnabled,
  type LLMChatV2Node,
} from '../chat-v2/llmChatV2NodeData.js';
import { isLLMChatV2StructuredResponseFormat } from '../chat-v2/chatV2FeatureCompatibility.js';
import { getChatV2ModelInfo } from '../chat-v2/modelRegistry.js';
import {
  buildLLMChatV2EditorCacheKey,
  cloneLLMChatV2EditorCacheOutputs,
  resolveLLMChatV2RuntimeConfig,
  resolveLLMChatV2RuntimeProviderOptions,
} from '../chat-v2/llmChatV2NodeRuntime.js';
import {
  anthropicEffortOptions,
  getChatV2ProviderLabel,
  googleThinkingLevelOptions,
  openAIReasoningEffortOptions,
} from '../chat-v2/providerOptions.js';
import { runChatV2Pipeline } from '../chat-v2/chatV2Pipeline.js';
import { runChatV2PipelineWithToolContinuation } from '../chat-v2/toolContinuation.js';
import { resolveEffectiveLLMChatV2Data } from '../chat-v2/resolveEffectiveLLMChatV2Data.js';
import { delegateToolCall } from './toolCallDelegation.js';

export type {
  LLMChatV2ApiKeySource,
  LLMChatV2EditorCacheKeyParts,
  LLMChatV2Node,
  LLMChatV2NodeConfigData,
  LLMChatV2NodeData,
} from '../chat-v2/llmChatV2NodeData.js';

export { buildLLMChatV2EditorCacheKey, resolveLLMChatV2RuntimeProviderOptions };

function usesBaseURLInput(data: LLMChatV2Node['data']): boolean {
  return data.provider === 'custom' ? data.useCustomProviderBaseURLInput : data.useBaseURLInput;
}

/**
 * Resolve a node's effective data for display (the canvas body, Feature 009). Guarded: resolve only
 * when there is BOTH a project modelConfig and a selector set — otherwise return `data` directly, so
 * an old project with no modelConfig (or a vanilla node) never throws inside the canvas render.
 */
function resolveBodyEffectiveData(
  data: LLMChatV2Node['data'],
  context: RivetUIContext | undefined,
): LLMChatV2Node['data'] {
  const modelConfig = context?.project?.modelConfig;
  const hasSelector = !!(data.llmPresetId || data.llmProfileId || data.llmSkillId);
  if (!modelConfig || !hasSelector) {
    return data;
  }
  return resolveEffectiveLLMChatV2Data(
    modelConfig,
    { llmPresetId: data.llmPresetId, llmProfileId: data.llmProfileId, llmSkillId: data.llmSkillId },
    data,
  );
}

function getCustomProviderBaseURLBodyLine(data: LLMChatV2Node['data']): string | undefined {
  if (data.provider !== 'custom') {
    return undefined;
  }

  if (data.useCustomProviderBaseURLInput) {
    return 'Provider base URL: (Using Input)';
  }

  const baseURL = data.customProviderBaseURL.trim();
  return baseURL ? `Provider base URL: ${baseURL}` : undefined;
}

function getOptionLabel(options: readonly { value: string; label: string }[], value: string | undefined): string {
  return options.find((option) => option.value === (value ?? ''))?.label ?? value ?? 'Default';
}

function getReasoningEffortBodyLine(data: LLMChatV2Node['data']): string | undefined {
  switch (data.provider) {
    case 'openai':
      return `Reasoning effort: ${getOptionLabel(openAIReasoningEffortOptions, data.openAIReasoningEffort)}`;
    case 'anthropic':
      return `Reasoning effort: ${getOptionLabel(anthropicEffortOptions, data.anthropicEffort)}`;
    case 'google':
      return `Reasoning effort: ${getOptionLabel(googleThinkingLevelOptions, data.googleThinkingLevel)}`;
    case 'custom':
      return undefined;
  }
}

export class LLMChatV2NodeImpl extends NodeImpl<LLMChatV2Node> {
  static create(): LLMChatV2Node {
    return {
      type: 'llmChatV2',
      title: 'LLM Chat',
      id: nanoid() as NodeId,
      visualData: {
        x: 0,
        y: 0,
        width: 260,
      },
      data: createLLMChatV2NodeData(),
    };
  }

  getInputDefinitions(): NodeInputDefinition[] {
    const inputs = getCommonChatV2Inputs(this.data, {
      includeFunctions: this.data.useToolCalling,
    });

    if (this.data.apiKeySource === 'input') {
      inputs.push({
        id: 'apiKey' as PortId,
        title: 'API Key',
        dataType: 'string',
        required: false,
      });
    }

    if (usesBaseURLInput(this.data)) {
      inputs.unshift({
        id: (this.data.provider === 'custom' ? 'customProviderBaseURL' : 'baseURL') as PortId,
        title: this.data.provider === 'custom' ? 'Provider base URL' : 'Base URL',
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

    if (this.data.useExtraProviderOptionsInput) {
      inputs.push({
        id: 'extraProviderOptions' as PortId,
        title: 'Extra Provider Options',
        dataType: ['string', 'object'] as const,
        required: false,
        coerced: true,
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
    const outputs = getCommonChatV2Outputs(this.data, {
      includeFunctionCalls: this.data.useToolCalling || hasLLMChatV2BuiltInToolsEnabled(this.data),
      includeUsage: this.data.outputUsage,
      includeReasoning: this.data.outputReasoning,
    });
    const responseOutput = outputs.find((output) => output.id === ('response' as PortId));

    if (responseOutput != null && isLLMChatV2StructuredResponseFormat(this.data.responseFormat)) {
      responseOutput.dataType = [
        'object',
        'object[]',
        'any',
        'any[]',
        'string',
        'string[]',
        'number',
        'number[]',
        'boolean',
        'boolean[]',
      ] as const;
    }

    if (this.data.outputRequestStatus) {
      outputs.push(
        {
          id: 'requestStatus' as PortId,
          title: 'Response Status',
          dataType: this.data.retryOnNon200 ? 'number[]' : 'number',
        },
        {
          id: 'requestError' as PortId,
          title: 'Response Error',
          dataType: this.data.retryOnNon200 ? 'string[]' : 'string',
        },
      );
    }

    return outputs;
  }

  static getUIData(): NodeUIData {
    return {
      infoBoxBody: dedent`
        Vendor-agnostic chat node built on the Vercel AI SDK.

        Choose OpenAI, Anthropic, Google, or a custom OpenAI-compatible provider inside the node without rewiring the graph.
        Common behavior stays shared; provider-specific settings only appear in advanced sections when relevant.
      `,
      contextMenuTitle: 'LLM Chat',
      infoBoxTitle: 'LLM Chat Node',
      group: ['Common', 'AI'],
    };
  }

  async getEditors(context: RivetUIContext): Promise<EditorDefinition<LLMChatV2Node>[]> {
    return getLLMChatV2Editors(this.data, context);
  }

  getBody(context: RivetUIContext) {
    // Feature 009: the canvas body shows what RESOLVES (run the pre-pass against the project's
    // modelConfig from the UI context), so a bound node stops lying about its own gpt-5 defaults.
    // Vanilla (no selector) → the rail returns `data` unchanged → byte-identical body.
    const effective = resolveBodyEffectiveData(this.data, context);
    const modelInfo = getChatV2ModelInfo(effective.provider, effective.model);
    const providerLabel = getChatV2ProviderLabel(effective.provider);
    const baseURLLine = getCustomProviderBaseURLBodyLine(effective);
    const modelLine = modelInfo?.displayName ?? effective.model;
    const providerDetails = baseURLLine ? [providerLabel, baseURLLine, modelLine] : [providerLabel, modelLine];
    const reasoningEffortLine = getReasoningEffortBodyLine(effective);

    return [
      ...providerDetails,
      ...(reasoningEffortLine ? [reasoningEffortLine] : []),
      `Temperature: ${effective.useTemperatureInput ? '(Using Input)' : effective.temperature}`,
      `Max output tokens: ${effective.useMaxTokensInput ? '(Using Input)' : effective.maxTokens}`,
    ].join('\n');
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    // Feature 008: resolve the node's Preset/Profile/Skill selectors into its effective data via the
    // pure pre-pass, reading the 006-assembled `context.settings.modelConfig` (so headless/published
    // runs resolve identically). With no selector set the rail returns `this.data` unchanged.
    const effectiveData = resolveEffectiveLLMChatV2Data(
      context.settings.modelConfig,
      {
        llmPresetId: this.data.llmPresetId,
        llmProfileId: this.data.llmProfileId,
        llmSkillId: this.data.llmSkillId,
      },
      this.data,
      context.trace,
    );

    const runtime = await resolveLLMChatV2RuntimeConfig({
      data: effectiveData,
      nodeId: this.chartNode.id,
      inputs,
      context,
    });

    if (runtime.cachedOutputs != null) {
      return runtime.cachedOutputs;
    }

    const result = runtime.shouldAutoContinueToolCalls
      ? await runChatV2PipelineWithToolContinuation({
          ...runtime.runOptions,
          autoContinue: true,
          maxToolRounds: runtime.maxToolRounds,
          functions: runtime.functions,
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
      : await runChatV2Pipeline(runtime.runOptions);

    if (runtime.cacheKey != null && runtime.editorCache != null) {
      runtime.editorCache.set(runtime.cacheKey, cloneLLMChatV2EditorCacheOutputs(result.commonOutputs));
    }

    return result.commonOutputs;
  }
}

export const llmChatV2Node = nodeDefinition(LLMChatV2NodeImpl, 'LLM Chat');
