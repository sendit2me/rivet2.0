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
