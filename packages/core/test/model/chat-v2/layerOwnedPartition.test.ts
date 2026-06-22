import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMChatV2NodeData } from '../../../src/model/chat-v2/llmChatV2NodeData.js';
import { LAYER_OWNED_MODEL_CONFIG_FIELDS } from '../../../src/model/chat-v2/resolveEffectiveLLMChatV2Data.js';

/**
 * R2 leak-class guard. `satisfies` proves every LAYER_OWNED entry is a valid key, NOT that the list is
 * COMPLETE — a genuinely layer-owned field left off would silently fall into the node-owned complement
 * and resolve to the node's default (the gpt-5/default collision, for that one field). Semantic
 * completeness can't be compiler-checked, so this test forces classification of EVERY field and fails
 * on any future-added one (forcing the review).
 *
 * NODE_OWNED is maintained here explicitly: the bindings + their input toggles, the per-param/per-call
 * input toggles (dead in R2 — the param ports are dropped — but still node-data, never read), and the
 * Q6 structural/output-contract fields (output shape / tools / response format / technical / per-call).
 */
const NODE_OWNED_FIELDS: string[] = [
  // model-config selectors (bindings) + their input-driven toggles
  'llmPresetId',
  'llmProfileId',
  'llmSkillId',
  'useLlmPresetIdInput',
  'useLlmProfileIdInput',
  'useLlmSkillIdInput',
  // per-param / connection input toggles (R2: ports dropped; toggles remain node-data, never read)
  'useModelInput',
  'useTemperatureInput',
  'useTopPInput',
  'useTopKInput',
  'usePresencePenaltyInput',
  'useFrequencyPenaltyInput',
  'useStopSequencesInput',
  'useSeedInput',
  'useMaxTokensInput',
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

describe('R2 — layer-owned/node-owned partition is EXHAUSTIVE over LLMChatV2NodeData', () => {
  const allKeys = Object.keys(createLLMChatV2NodeData()).sort();
  const layer = new Set<string>(LAYER_OWNED_MODEL_CONFIG_FIELDS);
  const node = new Set<string>(NODE_OWNED_FIELDS);

  it('every field is classified exactly once (no unclassified field silently falls to the node default)', () => {
    const unclassified = allKeys.filter((k) => !layer.has(k) && !node.has(k));
    const both = allKeys.filter((k) => layer.has(k) && node.has(k));
    assert.deepEqual(unclassified, [], `unclassified fields (classify in LAYER_OWNED or NODE_OWNED): ${unclassified.join(', ')}`);
    assert.deepEqual(both, [], `fields in BOTH buckets: ${both.join(', ')}`);
  });

  it('neither bucket names a field that no longer exists', () => {
    const keySet = new Set(allKeys);
    assert.deepEqual([...layer].filter((k) => !keySet.has(k)), [], 'stale LAYER_OWNED entries');
    assert.deepEqual(NODE_OWNED_FIELDS.filter((k) => !keySet.has(k)), [], 'stale NODE_OWNED entries');
  });
});
