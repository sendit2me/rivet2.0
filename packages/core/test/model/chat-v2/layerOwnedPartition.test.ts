import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMChatV2NodeData } from '../../../src/model/chat-v2/llmChatV2NodeData.js';
import { LAYER_OWNED_MODEL_CONFIG_FIELDS } from '../../../src/model/chat-v2/resolveEffectiveLLMChatV2Data.js';

/**
 * Type-split invariant guard. The partition is now **compiler-enforced** in source: disjointness
 * (`_AssertNodeLayerDisjoint` — the node type and `ChatV2LayerConfig` share no key) and LAYER_OWNED
 * completeness (`_AssertLayerOwnedComplete` — every layer key is listed) are type-level `never`
 * assertions. What remains genuinely runtime-observable, and what this test pins, is that the node
 * **mints only node-owned fields** — `createLLMChatV2NodeData()` carries ZERO layer config, so an
 * unbound node has no model config to silently default to (the gpt-5/default collision is gone by
 * construction). NODE_OWNED is the expected minted set: bindings + their input toggles, the per-param/
 * connection input toggles (vestigial post-R2 but still node-data), the per-call fields, and the Q6
 * structural/output-contract fields.
 */
const NODE_OWNED_FIELDS: string[] = [
  // model-config selectors (bindings) + their input-driven toggles
  'llmPresetId',
  'llmProfileId',
  'llmSkillId',
  'useLlmPresetIdInput',
  'useLlmProfileIdInput',
  'useLlmSkillIdInput',
  // connection drive-from-input toggles (the per-param toggles were removed in cut #4)
  'useBaseURLInput',
  'useCustomProviderBaseURLInput',
  'useHeadersInput',
  'useExtraProviderOptionsInput',
  'useAnthropicThinkingBudgetInput',
  'useGoogleThinkingBudgetInput',
  // per-call (node-owned)
  'openAIPreviousResponseId',
  'useOpenAIPreviousResponseIdInput',
  // Q6 structural / output-contract
  'responseFormat',
  'responseSchemaName',
  'useResponseSchemaNameInput',
  'responseSchemaDescription',
  'useResponseSchemaDescriptionInput',
  'useToolCalling',
  'toolChoice',
  'toolChoiceFunction',
  'parallelToolCalls',
  'autoContinueToolCalls',
  'maxToolRounds',
  'outputUsage',
  'outputReasoning',
  'cache',
  'useAsGraphPartialOutput',
  'retryOnNon200',
  'retryOnNon200RepeatTimes',
  'retryOnNon200CooldownMs',
  'outputRequestStatus',
];

describe('Type split — the node mints only node-owned fields', () => {
  const allKeys = Object.keys(createLLMChatV2NodeData()).sort();
  const layer = new Set<string>(LAYER_OWNED_MODEL_CONFIG_FIELDS);

  it('createLLMChatV2NodeData mints ZERO layer-owned fields (no node model config to silently default to)', () => {
    const leaked = allKeys.filter((k) => layer.has(k));
    assert.deepEqual(leaked, [], `layer-owned fields minted on the node: ${leaked.join(', ')}`);
  });

  it('mints exactly the expected node-owned set (no surprise field, none missing)', () => {
    const node = new Set(NODE_OWNED_FIELDS);
    const unexpected = allKeys.filter((k) => !node.has(k));
    const missing = NODE_OWNED_FIELDS.filter((k) => !allKeys.includes(k));
    assert.deepEqual(unexpected, [], `unexpected minted fields: ${unexpected.join(', ')}`);
    assert.deepEqual(missing, [], `expected node-owned fields not minted: ${missing.join(', ')}`);
  });
});
