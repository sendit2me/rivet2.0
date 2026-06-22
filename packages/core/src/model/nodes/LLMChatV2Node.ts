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
  type CompleteEffectiveLLMChatV2Data,
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
import {
  resolveEffectiveLLMChatV2Data,
  assessLLMChatV2Completeness,
  type NodeModelSelectors,
} from '../chat-v2/resolveEffectiveLLMChatV2Data.js';
import { getInputOrData } from '../../utils/inputs.js';
import { delegateToolCall } from './toolCallDelegation.js';

export type {
  LLMChatV2ApiKeySource,
  LLMChatV2EditorCacheKeyParts,
  LLMChatV2Node,
  LLMChatV2NodeConfigData,
  LLMChatV2NodeData,
} from '../chat-v2/llmChatV2NodeData.js';

export { buildLLMChatV2EditorCacheKey, resolveLLMChatV2RuntimeProviderOptions };

const LLM_SELECTOR_INPUT_PORTS = [
  { toggle: 'useLlmPresetIdInput', id: 'llmPresetId', title: 'Preset ID' },
  { toggle: 'useLlmProfileIdInput', id: 'llmProfileId', title: 'Profile ID' },
  { toggle: 'useLlmSkillIdInput', id: 'llmSkillId', title: 'Skill ID' },
] as const satisfies ReadonlyArray<{
  toggle: keyof LLMChatV2Node['data'];
  id: keyof LLMChatV2Node['data'] & string;
  title: string;
}>;

/**
 * The effective selector ids for the resolution pre-pass: each selector's input-port value when its
 * "drive from input" toggle is on and the port is connected, otherwise its data field (and the data
 * field again as the fallback when the toggle is on but unconnected). `getInputOrData` derives the
 * `use…Input` toggle from the key, so an unset/data-driven node returns its data ids verbatim — the
 * byte-identical rail (all-empty selectors → resolver identity) is preserved.
 */
export function resolveNodeModelSelectors(data: LLMChatV2Node['data'], inputs: Inputs): NodeModelSelectors {
  return {
    llmPresetId: getInputOrData(data, inputs, 'llmPresetId', 'string'),
    llmProfileId: getInputOrData(data, inputs, 'llmProfileId', 'string'),
    llmSkillId: getInputOrData(data, inputs, 'llmSkillId', 'string'),
  };
}

function getCustomProviderBaseURLBodyLine(data: CompleteEffectiveLLMChatV2Data): string | undefined {
  if (data.provider !== 'custom') {
    return undefined;
  }

  if (data.useCustomProviderBaseURLInput) {
    return 'Provider base URL: (Using Input)';
  }

  const baseURL = (data.customProviderBaseURL ?? '').trim();
  return baseURL ? `Provider base URL: ${baseURL}` : undefined;
}

function getOptionLabel(options: readonly { value: string; label: string }[], value: string | undefined): string {
  return options.find((option) => option.value === (value ?? ''))?.label ?? value ?? 'Default';
}

function getReasoningEffortBodyLine(data: CompleteEffectiveLLMChatV2Data): string | undefined {
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
    // R2 full-port-set: model-config is layer-owned, so the model-param input ports are gone and the
    // remaining per-call/connection ports no longer gate on `this.data.provider`/`apiKeySource` (now
    // layer-ignored — and unknowable here for an input-driven binding). Emit the full set; the runtime
    // uses what the resolved config actually needs and ignores the rest (per-provider narrowing deferred).
    const inputs = getCommonChatV2Inputs(this.data, {
      includeFunctions: this.data.useToolCalling,
    });

    // Connection: the API-key value channel — always present; used iff the resolved apiKeySource is 'input'.
    inputs.push({ id: 'apiKey' as PortId, title: 'API Key', dataType: 'string', required: false });

    // Per-call (node-owned): previous response id — gated only by its own toggle (provider-agnostic here).
    if (this.data.useOpenAIPreviousResponseIdInput) {
      inputs.push({
        id: 'previousResponseId' as PortId,
        title: 'Previous Response ID',
        dataType: 'string',
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

    // Input-driven model-config selectors: when a selector's "drive from input" toggle is on, expose
    // a string port carrying its id (e.g. arbiter's choice → resume node's Profile). process() reads
    // these (falling back to the data id) before the resolution pre-pass.
    for (const { toggle, id, title } of LLM_SELECTOR_INPUT_PORTS) {
      if (this.data[toggle]) {
        inputs.push({ id: id as PortId, title, dataType: 'string', required: false });
      }
    }

    return inputs;
  }

  getOutputDefinitions(): NodeOutputDefinition[] {
    const outputs = getCommonChatV2Outputs(this.data, {
      // Built-in tools (web search / code interpreter) are layer-resolved — unknowable at definition
      // time on the config-less node (same as the R2 port-narrowing deferral), so the function-calls
      // output keys off the node-owned tool-use toggle only.
      includeFunctionCalls: this.data.useToolCalling,
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
    // R2: the canvas body shows what RESOLVES from the bound config (model-config is layer-only). An
    // unbound / partially-bound node has no config to run on → show the incomplete state, never a
    // silent default. (Uses the data-driven selectors; an input-driven binding resolves at run time.)
    const effective = resolveEffectiveLLMChatV2Data(
      context?.project?.modelConfig,
      {
        llmPresetId: this.data.llmPresetId,
        llmProfileId: this.data.llmProfileId,
        llmSkillId: this.data.llmSkillId,
      },
      this.data,
    );
    const completeness = assessLLMChatV2Completeness(effective);
    if (!completeness.complete) {
      return `⚠ Incomplete — ${completeness.reason}.`;
    }
    // The gate narrows to the Complete effective config (provider + model guaranteed).
    const complete = completeness.effective;
    const modelInfo = getChatV2ModelInfo(complete.provider, complete.model);
    const providerLabel = getChatV2ProviderLabel(complete.provider);
    const baseURLLine = getCustomProviderBaseURLBodyLine(complete);
    const modelLine = modelInfo?.displayName ?? complete.model;
    const providerDetails = baseURLLine ? [providerLabel, baseURLLine, modelLine] : [providerLabel, modelLine];
    const reasoningEffortLine = getReasoningEffortBodyLine(complete);

    return [
      ...providerDetails,
      ...(reasoningEffortLine ? [reasoningEffortLine] : []),
      `Temperature: ${complete.temperature}`,
      `Max output tokens: ${complete.maxTokens}`,
    ].join('\n');
  }

  async process(inputs: Inputs, context: InternalProcessContext): Promise<Outputs> {
    // R2: resolve the node's Preset/Profile/Skill selectors into its effective data via the pure
    // pre-pass (overlap-deletion — model-config comes ONLY from the layer). With no/partial binding
    // the resolved config is incomplete and the node refuses to run, surfacing why (config-less: there
    // is no node model-config to silently default to).
    const effectiveData = resolveEffectiveLLMChatV2Data(
      context.settings.modelConfig,
      resolveNodeModelSelectors(this.data, inputs),
      this.data,
      context.trace,
    );

    const completeness = assessLLMChatV2Completeness(effectiveData);
    if (!completeness.complete) {
      throw new Error(`LLM Chat is incomplete: ${completeness.reason}.`);
    }

    const runtime = await resolveLLMChatV2RuntimeConfig({
      data: completeness.effective, // the gate's narrowed Complete config (provider + model guaranteed)
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
