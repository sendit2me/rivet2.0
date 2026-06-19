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

/**
 * Feature 005 Phase C1: the node gains an `extraBody` object editor, but in a SEPARATE advanced
 * group flagged `advanced: true` so the app CSS-hides it behind "Show overrides" (default off). The
 * clean-node default — no `extraBody`, Show-overrides off — must stay byte-identical to today.
 */
describe('ChatNodeBase — 005 C1: node extraBody behind the clean default', () => {
  function findGroups(
    editors: ReadonlyArray<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    return editors.filter((e) => e['type'] === 'group');
  }

  const editors = ChatNodeBase.getEditors() as ReadonlyArray<Record<string, unknown>>;

  it('default data carries no extraBody (clean default unchanged)', () => {
    assert.equal((ChatNodeBase.defaultData() as Record<string, unknown>)['extraBody'], undefined);
  });

  it('the extraBody editor lives in its OWN advanced group (not the existing Advanced group)', () => {
    const advancedGroups = findGroups(editors).filter((g) => g['advanced'] === true);
    assert.equal(advancedGroups.length, 1, 'exactly one advanced group');
    const group = advancedGroups[0]!;
    const groupEditors = group['editors'] as ReadonlyArray<Record<string, unknown>>;
    const extraBodyEditor = groupEditors.find((e) => e['dataKey'] === 'extraBody');
    assert.ok(extraBodyEditor, 'advanced group holds the extraBody editor');
    assert.equal(extraBodyEditor!['type'], 'custom');
    assert.equal(extraBodyEditor!['customEditorId'], 'extraBodyJson');

    // The pre-existing "Advanced" group (token calc, usage, reasoning, …) is NOT flagged advanced,
    // so it stays visible — gating it would hide shipped controls.
    const existingAdvanced = findGroups(editors).find((g) => g['label'] === 'Advanced');
    assert.ok(existingAdvanced, 'the existing Advanced group still exists');
    assert.notEqual(existingAdvanced!['advanced'], true);
  });

  it('the default output port-list is unchanged by the new group', () => {
    const ids = ChatNodeBase.getOutputDefinitions(ChatNodeBase.defaultData()).map((o) => o.id);
    assert.deepEqual(ids, ['response', 'in-messages', 'all-messages', 'responseTokens']);
  });
});
