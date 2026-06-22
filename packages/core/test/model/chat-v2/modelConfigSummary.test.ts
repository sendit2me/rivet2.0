import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveModelConfigSummary, type SummaryGroup } from '../../../src/model/chat-v2/modelConfigSummary.js';

describe('R4 cleanup — getCommonChatV2Editors is removed (dead since R2 deleted the editor groups)', () => {
  it('chatV2Shared no longer defines it', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../src/model/chat-v2/chatV2Shared.ts'),
      'utf8',
    );
    assert.doesNotMatch(src, /getCommonChatV2Editors/);
  });
});

const rows = (groups: SummaryGroup[]) => groups.flatMap((g) => g.rows);
const labels = (groups: SummaryGroup[]) => rows(groups).map((r) => r.label);
const valueOf = (groups: SummaryGroup[], label: string) => rows(groups).find((r) => r.label === label)?.value;

describe('deriveModelConfigSummary — schema-driven per kind (R4)', () => {
  it('text-to-text: reproduces the chat card rows for a complete binding (one unlabeled group → flat)', () => {
    const g = deriveModelConfigSummary(
      { provider: 'custom', model: 'Qwen-X', temperature: 0.2, maxTokens: 512, extraProviderOptions: '{"a":1}' },
      'text-to-text',
    );
    assert.equal(g.length, 1); // one group
    assert.equal(g[0]!.label, undefined); // unlabeled → renders flat, no header (the chat card is headerless)
    assert.deepEqual(
      g[0]!.rows.map((r) => [r.label, r.value]),
      [
        ['Provider', 'Custom provider'],
        ['Model', 'Qwen-X'],
        ['Reasoning', '—'], // custom has no effort field
        ['Temperature', '0.2'],
        ['Max tokens', '512'],
        ['Extra body', 'a'], // top-level keys of the extra body
      ],
    );
  });

  it('skips unset temperature/maxTokens (omitted, not a literal "undefined" row)', () => {
    const g = deriveModelConfigSummary({ provider: 'openai', model: 'gpt-x' }, 'text-to-text');
    assert.ok(!labels(g).includes('Temperature'));
    assert.ok(!labels(g).includes('Max tokens'));
    // provider / model / reasoning still present (reasoning is never skipped — shows Default/—)
    assert.deepEqual(labels(g), ['Provider', 'Model', 'Reasoning']);
  });

  it('reasoning maps to the resolved provider effort field; Default when unset; — for custom', () => {
    assert.equal(valueOf(deriveModelConfigSummary({ provider: 'openai', model: 'm', openAIReasoningEffort: 'high' }, 'text-to-text'), 'Reasoning'), 'High');
    assert.equal(valueOf(deriveModelConfigSummary({ provider: 'openai', model: 'm' }, 'text-to-text'), 'Reasoning'), 'Default');
    assert.equal(valueOf(deriveModelConfigSummary({ provider: 'anthropic', model: 'm', anthropicEffort: 'low' }, 'text-to-text'), 'Reasoning'), 'Low');
    assert.equal(valueOf(deriveModelConfigSummary({ provider: 'custom', model: 'm' }, 'text-to-text'), 'Reasoning'), '—');
  });

  it('extra body row appears only for the custom provider', () => {
    assert.ok(!labels(deriveModelConfigSummary({ provider: 'openai', model: 'm' }, 'text-to-text')).includes('Extra body'));
    assert.equal(valueOf(deriveModelConfigSummary({ provider: 'custom', model: 'm', extraProviderOptions: '' }, 'text-to-text'), 'Extra body'), '(none)');
  });

  it('FORCING FIXTURE: text-to-image renders image fields via its descriptor — no chat rows, generic mapper', () => {
    const g = deriveModelConfigSummary({ provider: 'custom', model: 'sdxl', width: 1024, height: 768 }, 'text-to-image');
    const dims = g.find((group) => group.label === 'Dimensions');
    assert.ok(dims, 'has a labeled Dimensions group (the generic group-header path)');
    assert.deepEqual(
      dims!.rows.map((r) => [r.label, r.value]),
      [
        ['Width', '1024'],
        ['Height', '768'],
      ],
    );
    // provider/model + image dims, and NONE of the chat-specific rows — the mapper carries no kind-branch.
    assert.deepEqual(labels(g), ['Provider', 'Model', 'Width', 'Height']);
    for (const chat of ['Temperature', 'Reasoning', 'Max tokens', 'Extra body']) {
      assert.ok(!labels(g).includes(chat), `no chat row '${chat}' under text-to-image`);
    }
  });
});
