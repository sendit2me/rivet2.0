import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  coercePromptToChatMessages,
  prependSkillSystemPrompt,
  prependSystemPrompt,
} from '../../../src/model/chat/chatMessages.js';
import { clampMaxTokensToModelLimit, setRequestAndResponseTokenOutputs } from '../../../src/model/chat/tokenBudget.js';
import { getWarnings } from '../../../src/utils/outputs.js';

describe('chatMessages helpers', () => {
  it('coerces string arrays into user chat messages', () => {
    assert.deepEqual(coercePromptToChatMessages({ type: 'string[]', value: ['a', 'b'] }), [
      { type: 'user', message: 'a' },
      { type: 'user', message: 'b' },
    ]);
  });

  it('prepends system prompt and replaces an existing leading system message', () => {
    assert.deepEqual(
      prependSystemPrompt(
        [
          { type: 'system', message: 'old' },
          { type: 'user', message: 'hello' },
        ],
        { type: 'string', value: 'new' },
      ),
      [
        { type: 'system', message: 'new' },
        { type: 'user', message: 'hello' },
      ],
    );
  });
});

describe('prependSkillSystemPrompt (Skill pre-prompt injection)', () => {
  it('passes through unchanged for an empty/undefined skill prompt (No-Skill)', () => {
    const messages = [{ type: 'user', message: 'hi' }] as const;
    assert.deepEqual(prependSkillSystemPrompt([...messages], undefined), messages);
    assert.deepEqual(prependSkillSystemPrompt([...messages], ''), messages);
  });

  it('injects the skill system prompt once, at the front, as a system message', () => {
    assert.deepEqual(prependSkillSystemPrompt([{ type: 'user', message: 'hi' }], 'You are terse.'), [
      { type: 'system', message: 'You are terse.' },
      { type: 'user', message: 'hi' },
    ]);
  });

  it("preserves the node's own (different) system message, skill first", () => {
    // De-dupe is by exact text, so a legitimately different system message is never collapsed.
    assert.deepEqual(
      prependSkillSystemPrompt(
        [
          { type: 'system', message: 'Node system rules.' },
          { type: 'user', message: 'hi' },
        ],
        'Skill: be a reviewer.',
      ),
      [
        { type: 'system', message: 'Skill: be a reviewer.' },
        { type: 'system', message: 'Node system rules.' },
        { type: 'user', message: 'hi' },
      ],
    );
  });

  it('does not duplicate the skill prompt on loop feedback (already at index 0)', () => {
    // Simulates ChatLoop feeding `all-messages` back into `prompt`: the skill-system from the
    // prior iteration is already present. Re-injection must leave exactly one, still at front.
    const fedBack = [
      { type: 'system', message: 'Skill: be a reviewer.' },
      { type: 'user', message: 'turn 1' },
      { type: 'assistant', message: 'reply 1' },
      { type: 'user', message: 'turn 2' },
    ];
    const result = prependSkillSystemPrompt(fedBack as never, 'Skill: be a reviewer.');
    assert.deepEqual(result, [
      { type: 'system', message: 'Skill: be a reviewer.' },
      { type: 'user', message: 'turn 1' },
      { type: 'assistant', message: 'reply 1' },
      { type: 'user', message: 'turn 2' },
    ]);
    assert.equal(result.filter((m) => m.type === 'system' && m.message === 'Skill: be a reviewer.').length, 1);
  });
});

describe('tokenBudget helpers', () => {
  it('clamps max tokens and adds a warning when prompt plus max tokens exceed the model limit', () => {
    const output: Record<string, any> = {};
    const maxTokens = clampMaxTokensToModelLimit(output as never, 'test-model', 900, 200, 1000);

    assert.equal(maxTokens, 95);
    assert.match(getWarnings(output as never)![0]!, /max tokens together exceed this limit/i);
  });

  it('writes request and response token outputs', () => {
    const output: Record<string, any> = {};
    setRequestAndResponseTokenOutputs(output as never, 12, 34);

    assert.deepEqual(output['requestTokens'], { type: 'number', value: 12 });
    assert.deepEqual(output['responseTokens'], { type: 'number', value: 34 });
  });
});
