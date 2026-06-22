import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMChatV2NodeData, type LLMChatV2NodeData } from '../../../src/model/chat-v2/llmChatV2NodeData.js';
import { resolveLLMChatV2ApiKey } from '../../../src/model/chat-v2/chatV2RuntimeOptions.js';
import type { Inputs } from '../../../src/model/GraphProcessor.js';

/**
 * R2 full-port-set precondition: the apiKey input port is now ALWAYS present, so the runtime must use
 * the wired value ONLY when the resolved `apiKeySource === 'input'`. Otherwise an irrelevant wired
 * apiKey must be ignored (the configured/env key wins) — confirming the full-port-set doesn't leak.
 */
const node = (over: Partial<LLMChatV2NodeData>): LLMChatV2NodeData => ({ ...createLLMChatV2NodeData(), ...over });
const ctx = { settings: { openAiKey: 'CONFIGURED-KEY' }, getPluginConfig: () => undefined } as never;
const wired = { apiKey: { type: 'string', value: 'WIRED-KEY' } } as unknown as Inputs;

describe('R2 — apiKey input is gated on the resolved apiKeySource', () => {
  it('apiKeySource = environment + apiKey wired → the wired value is IGNORED (configured key wins)', () => {
    assert.equal(resolveLLMChatV2ApiKey(node({ provider: 'openai', apiKeySource: 'environment' }), wired, ctx), 'CONFIGURED-KEY');
  });

  it('apiKeySource = input → the wired value is used', () => {
    assert.equal(resolveLLMChatV2ApiKey(node({ provider: 'openai', apiKeySource: 'input' }), wired, ctx), 'WIRED-KEY');
  });
});
