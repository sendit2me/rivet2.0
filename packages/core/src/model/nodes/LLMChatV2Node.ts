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
import { getChatV2ModelInfo } from '../chat-v2/modelRegistry.js';
import {
  buildLLMChatV2EditorCacheKey,
  cloneLLMChatV2EditorCacheOutputs,
  resolveLLMChatV2RuntimeConfig,
  resolveLLMChatV2RuntimeProviderOptions,
} from '../chat-v2/llmChatV2NodeRuntime.js';
import { getChatV2ProviderLabel } from '../chat-v2/providerOptions.js';
import { runChatV2Pipeline } from '../chat-v2/chatV2Pipeline.js';
import { runChatV2PipelineWithToolContinuation } from '../chat-v2/toolContinuation.js';
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

    if (this.data.outputRequestStatus) {
      outputs.push(
        {
          id: 'requestStatus' as PortId,
          title: 'Response Status',
          dataType: 'number',
        },
        {
          id: 'requestError' as PortId,
          title: 'Response Error',
          dataType: 'string',
        },
      );

      if (this.data.retryOnNon200) {
        outputs.push(
          {
            id: 'requestStatuses' as PortId,
            title: 'Request Statuses',
            dataType: 'number[]',
          },
          {
            id: 'requestErrors' as PortId,
            title: 'Request Errors',
            dataType: 'string[]',
          },
        );
      }
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
    const runtime = await resolveLLMChatV2RuntimeConfig({
      data: this.data,
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
