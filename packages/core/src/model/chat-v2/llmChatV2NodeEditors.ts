import type { EditorDefinition } from '../EditorDefinition.js';
import type { RivetUIContext } from '../RivetUIContext.js';
import {
  DEFAULT_LLM_CHAT_V2_RETRY_ON_NON_200_COOLDOWN_MS,
  DEFAULT_LLM_CHAT_V2_RETRY_ON_NON_200_REPEAT_TIMES,
} from './chatV2Retry.js';
import type { LLMChatV2Node, LLMChatV2NodeData } from './llmChatV2NodeData.js';

type LLMChatV2EditorDefinition = EditorDefinition<LLMChatV2Node>;

function group(label: string, editors: LLMChatV2EditorDefinition[], defaultOpen?: boolean): LLMChatV2EditorDefinition {
  return {
    type: 'group',
    label,
    ...(defaultOpen != null ? { defaultOpen } : {}),
    editors,
  };
}

function getModelConfigEditors(): LLMChatV2EditorDefinition {
  // Plain dropdowns (Feature 008b); the tree-selector + progressive disclosure is Feature 009. The
  // renderers (app `LlmSelectorEditors`) populate options from the project modelConfig (id + name).
  return group('Model config', [
    {
      type: 'llmPresetSelector',
      label: 'Preset',
      dataKey: 'llmPresetId',
      useInputToggleDataKey: 'useLlmPresetIdInput',
      skillKind: 'text-to-text',
      helperMessage: 'Apply a Preset (Profile + Skill + overrides). Profile / Skill below override its pieces.',
    },
    {
      type: 'llmProfileSelector',
      label: 'Profile',
      dataKey: 'llmProfileId',
      useInputToggleDataKey: 'useLlmProfileIdInput',
      helperMessage: 'The connection (provider / endpoint / key) — replaces the preset profile when set.',
    },
    {
      type: 'llmSkillSelector',
      label: 'Skill',
      dataKey: 'llmSkillId',
      useInputToggleDataKey: 'useLlmSkillIdInput',
      skillKind: 'text-to-text',
      helperMessage: 'The behaviour + model — replaces the preset skill when set.',
    },
    // Feature 009: the resolved-config Summary Card — what the selection actually runs, with
    // inherited/overridden markers + inline tweak. The app renderer runs the resolver at render time.
    {
      type: 'llmModelConfigSummary',
      label: 'Resolved config',
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
      hideIf: (data) => !data.useToolCalling || data.provider === 'custom',
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
      // Node-owned output toggle (R2): moved here from the removed Reasoning group — it controls the
      // node's Reasoning output port, not model behaviour.
      type: 'toggle',
      label: 'Output reasoning',
      dataKey: 'outputReasoning',
      helperMessage: "Adds a Reasoning output with the model's reasoning or thinking text when the provider returns it.",
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

function getTechnicalDetailsEditors(): LLMChatV2EditorDefinition {
  return group('Technical details', [
    {
      type: 'toggle',
      label: 'Retry on non-200',
      dataKey: 'retryOnNon200',
      helperMessage: 'Retries provider requests when Vercel reports a non-200 HTTP status.',
    },
    {
      type: 'number',
      label: 'Repeat times',
      dataKey: 'retryOnNon200RepeatTimes',
      defaultValue: DEFAULT_LLM_CHAT_V2_RETRY_ON_NON_200_REPEAT_TIMES,
      min: 1,
      step: 1,
      layout: 'inline',
      helperMessage: 'Times to repeat after the initial request',
      hideIf: (data) => !data.retryOnNon200,
    },
    {
      type: 'number',
      label: 'Cooldown, ms',
      dataKey: 'retryOnNon200CooldownMs',
      defaultValue: DEFAULT_LLM_CHAT_V2_RETRY_ON_NON_200_COOLDOWN_MS,
      min: 0,
      step: 1,
      layout: 'inline',
      helperMessage: 'Milliseconds to wait between repeats',
      hideIf: (data) => !data.retryOnNon200,
    },
    {
      type: 'toggle',
      label: 'Output request status',
      dataKey: 'outputRequestStatus',
      helperMessage: 'Adds Response Status and Response Error outputs. Retry mode changes them to per-attempt arrays.',
    },
  ]);
}

/**
 * Groups the resolution determines (Feature 009). When a model-config source is bound, these collapse
 * behind the existing "Show overrides" disclosure (default off) — their values are summarized on the
 * Resolved-config card, and showing the node's own (e.g. OpenAI/gpt-5) groups would contradict it.
 * Node-behavior groups (Outputs / Tools / Response format / Technical details) stay visible.
 */
export async function getLLMChatV2Editors(
  _data: LLMChatV2NodeData,
  _context: RivetUIContext,
): Promise<EditorDefinition<LLMChatV2Node>[]> {
  // R2 — config-less node: the model-config groups (Model / OpenAI / Anthropic / Google / Parameters /
  // Reasoning / Provider Advanced) are REMOVED entirely, not collapsed-when-bound. The editor is the
  // kind-filtered selectors + the resolved-config card (model-config = pick a config), plus the
  // node-owned Q6 structural groups (Response format / Tools / Outputs / Technical details).
  return [
    getModelConfigEditors(),
    getResponseFormatEditors(),
    getToolEditors(),
    getOutputEditors(),
    getTechnicalDetailsEditors(),
  ];
}
