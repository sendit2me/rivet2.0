import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LLMChatV2NodeImpl, resolveNodeModelSelectors } from '../../../src/model/nodes/LLMChatV2Node.js';
import { createLLMChatV2NodeData, type LLMChatV2NodeData } from '../../../src/model/chat-v2/llmChatV2NodeData.js';
import type { Inputs } from '../../../src/model/GraphProcessor.js';

const strInput = (value: string): Inputs => ({ llmProfileId: { type: 'string', value } } as unknown as Inputs);

describe('input-driven model-config selectors', () => {
  describe('resolveNodeModelSelectors', () => {
    it('data-driven default: empty selectors (preserves the byte-identical rail)', () => {
      const data = createLLMChatV2NodeData();
      assert.deepEqual(resolveNodeModelSelectors(data, {} as Inputs), {
        llmPresetId: '',
        llmProfileId: '',
        llmSkillId: '',
      });
    });

    it('data id is returned verbatim when the toggle is off', () => {
      const data: LLMChatV2NodeData = { ...createLLMChatV2NodeData(), llmProfileId: 'profile-data' };
      // Even with a connected input, the toggle being off means the data id wins.
      assert.equal(resolveNodeModelSelectors(data, strInput('profile-input')).llmProfileId, 'profile-data');
    });

    it('input id overrides the data id when the toggle is on and the port is connected', () => {
      const data: LLMChatV2NodeData = {
        ...createLLMChatV2NodeData(),
        llmProfileId: 'profile-data',
        useLlmProfileIdInput: true,
      };
      assert.equal(resolveNodeModelSelectors(data, strInput('profile-input')).llmProfileId, 'profile-input');
    });

    it('falls back to the data id when the toggle is on but the port is unconnected', () => {
      const data: LLMChatV2NodeData = {
        ...createLLMChatV2NodeData(),
        llmProfileId: 'profile-data',
        useLlmProfileIdInput: true,
      };
      assert.equal(resolveNodeModelSelectors(data, {} as Inputs).llmProfileId, 'profile-data');
    });

    it('an unknown input id is passed through verbatim (the pre-pass treats it as not-found, graceful)', () => {
      const data: LLMChatV2NodeData = { ...createLLMChatV2NodeData(), useLlmProfileIdInput: true };
      assert.equal(resolveNodeModelSelectors(data, strInput('profile-typo')).llmProfileId, 'profile-typo');
    });
  });

  describe('getInputDefinitions', () => {
    const idsFor = (overrides: Partial<LLMChatV2NodeData>): string[] => {
      const base = LLMChatV2NodeImpl.create();
      const node = new LLMChatV2NodeImpl({ ...base, data: { ...base.data, ...overrides } });
      return node.getInputDefinitions().map((i) => i.id as string);
    };

    it('default: no selector input ports', () => {
      const ids = idsFor({});
      for (const id of ['llmPresetId', 'llmProfileId', 'llmSkillId']) {
        assert.equal(ids.includes(id), false, `${id} should not be a port by default`);
      }
    });

    it('each toggle exposes exactly its selector port', () => {
      assert.equal(idsFor({ useLlmPresetIdInput: true }).includes('llmPresetId'), true);
      assert.equal(idsFor({ useLlmProfileIdInput: true }).includes('llmProfileId'), true);
      assert.equal(idsFor({ useLlmSkillIdInput: true }).includes('llmSkillId'), true);
      // a profile toggle does not add the preset/skill ports
      const profileOnly = idsFor({ useLlmProfileIdInput: true });
      assert.equal(profileOnly.includes('llmPresetId'), false);
      assert.equal(profileOnly.includes('llmSkillId'), false);
    });

    it('all three toggles → all three ports', () => {
      const ids = idsFor({ useLlmPresetIdInput: true, useLlmProfileIdInput: true, useLlmSkillIdInput: true });
      for (const id of ['llmPresetId', 'llmProfileId', 'llmSkillId'] as const) {
        assert.equal(ids.includes(id), true, `${id} port missing`);
      }
    });
  });
});
