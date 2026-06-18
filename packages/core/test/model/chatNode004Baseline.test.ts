import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChatNodeBase, type ChatNodeData } from '../../src/model/nodes/ChatNodeBase.js';

/**
 * Feature 004 byte-identical rail: with nothing opted in (default data), the node's output
 * port-list must equal the hardcoded pre-004 baseline (no `reasoning` port), and the new fields
 * must default to off/absent. (The request-body half of the rail is pinned by applyExtraBody
 * returning the same options reference when extraBody is empty — see applyExtraBody.test.ts.)
 */
describe('ChatNodeBase — 004 byte-identical baseline', () => {
  it('default data leaves the new fields off/absent', () => {
    const d = ChatNodeBase.defaultData();
    assert.equal(d.outputReasoning, false);
    assert.equal((d as Record<string, unknown>)['extraBody'], undefined);
  });

  it('default port-list is the hardcoded pre-004 set (no `reasoning` port)', () => {
    const ids = ChatNodeBase.getOutputDefinitions(ChatNodeBase.defaultData()).map((o) => o.id);
    assert.deepEqual(ids, ['response', 'in-messages', 'all-messages', 'responseTokens']);
  });

  it('`reasoning` port appears only when outputReasoning is on', () => {
    const data: ChatNodeData = { ...ChatNodeBase.defaultData(), outputReasoning: true };
    const ids = ChatNodeBase.getOutputDefinitions(data).map((o) => o.id);
    assert.equal(ids.includes('reasoning'), true);
    // …and it is a string port placed after responseTokens (mirrors the usage pattern).
    assert.deepEqual(ids, ['response', 'in-messages', 'all-messages', 'responseTokens', 'reasoning']);
  });
});

/**
 * Feature 005 Phase A: the three Profile/Skill/Preset string-id editors become typed selectors.
 * This is UI metadata only — the no-selection runtime baseline above is unchanged, so the swap
 * stays byte-identical for execution (D4). Here we pin that the swap happened and bound correctly.
 */
describe('ChatNodeBase — 005 Phase A: node selector editors', () => {
  function flattenEditors(editors: ReadonlyArray<{ type: string; editors?: unknown }>): Array<Record<string, unknown>> {
    return editors.flatMap((e) =>
      e.type === 'group'
        ? flattenEditors(e.editors as ReadonlyArray<{ type: string; editors?: unknown }>)
        : [e as Record<string, unknown>],
    );
  }
  const editors = flattenEditors(ChatNodeBase.getEditors() as ReadonlyArray<{ type: string; editors?: unknown }>);
  const byKey = (k: string) => editors.find((e) => e['dataKey'] === k);

  it('binds the three ids to typed selectors (not plain string fields)', () => {
    assert.equal(byKey('llmProfileId')?.['type'], 'llmProfileSelector');
    assert.equal(byKey('llmSkillId')?.['type'], 'llmSkillSelector');
    assert.equal(byKey('llmPresetId')?.['type'], 'llmPresetSelector');
  });

  it('leaves no leftover string editor on the selector dataKeys (swap is complete)', () => {
    for (const k of ['llmProfileId', 'llmSkillId', 'llmPresetId']) {
      assert.notEqual(byKey(k)?.['type'], 'string');
    }
  });
});
