import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOpenAINonStreamingResponse,
  applyOpenAIStreamingResponse,
} from '../../../src/model/chat/openAIChatRuntime.js';
import type { ChatCompletionChunk } from '../../../src/utils/openai.js';
import type { Outputs } from '../../../src/model/GraphProcessor.js';

describe('reasoning accumulation (E1)', () => {
  it('non-streaming: surfaces message.reasoning_content', async () => {
    const output: Outputs = {};
    const { reasoning } = await applyOpenAINonStreamingResponse({
      response: { choices: [{ message: { content: 'answer', reasoning_content: 'because X' } }] },
      output,
      messages: [],
      isMultiResponse: false,
      modalities: undefined,
      audioFormat: undefined,
      modelCosts: undefined,
      durationMs: 0,
    });
    assert.equal(reasoning, 'because X');
  });

  it('non-streaming: empty string when the model emits no reasoning_content', async () => {
    const { reasoning } = await applyOpenAINonStreamingResponse({
      response: { choices: [{ message: { content: 'answer' } }] },
      output: {},
      messages: [],
      isMultiResponse: false,
      modalities: undefined,
      audioFormat: undefined,
      modelCosts: undefined,
      durationMs: 0,
    });
    assert.equal(reasoning, '');
  });

  it('streaming: accumulates reasoning_content deltas in order', async () => {
    async function* chunks(): AsyncGenerator<ChatCompletionChunk> {
      yield { choices: [{ index: 0, message_index: 0, delta: { reasoning_content: 'think ' }, finish_reason: null }] };
      yield { choices: [{ index: 0, message_index: 0, delta: { reasoning_content: 'harder' }, finish_reason: null }] };
      yield { choices: [{ index: 0, message_index: 0, delta: { content: 'answer' }, finish_reason: 'stop' }] };
    }
    const { reasoning } = await applyOpenAIStreamingResponse({
      chunks: chunks(),
      output: {},
      messages: [],
      isMultiResponse: false,
      parallelFunctionCalling: false,
      context: { settings: {}, onPartialOutputs: undefined },
      tokenizer: { getTokenCountForString: async () => 0 },
      tokenizerInfo: {} as never,
      inputTokenCount: 0,
      numberOfChoices: 1,
      useServerTokenCalculation: true,
      modelCosts: { prompt: 0, completion: 0 },
    });
    assert.equal(reasoning, 'think harder');
  });

  it('streaming: empty string when no reasoning_content deltas arrive', async () => {
    async function* chunks(): AsyncGenerator<ChatCompletionChunk> {
      yield { choices: [{ index: 0, message_index: 0, delta: { content: 'answer' }, finish_reason: 'stop' }] };
    }
    const { reasoning } = await applyOpenAIStreamingResponse({
      chunks: chunks(),
      output: {},
      messages: [],
      isMultiResponse: false,
      parallelFunctionCalling: false,
      context: { settings: {}, onPartialOutputs: undefined },
      tokenizer: { getTokenCountForString: async () => 0 },
      tokenizerInfo: {} as never,
      inputTokenCount: 0,
      numberOfChoices: 1,
      useServerTokenCalculation: true,
      modelCosts: { prompt: 0, completion: 0 },
    });
    assert.equal(reasoning, '');
  });
});
