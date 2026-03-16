import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  calculateAudioUsageCost,
  calculatePromptAndCompletionCost,
  getOutputTokensForCostCalculation,
} from '../../../src/model/chat/chatCost.js';
import {
  applyToolCallDeltas,
  applyStreamedFunctionCallOutputs,
  createAssistantMessagesOutput,
} from '../../../src/model/chat/streamChatResponse.js';

describe('chatCost helpers', () => {
  it('calculates prompt and completion cost from token counts', () => {
    const result = calculatePromptAndCompletionCost(1000, 500, { prompt: 2, completion: 4 });

    assert.deepEqual(result, {
      promptCost: 2,
      completionCost: 2,
      totalCost: 4,
    });
  });

  it('calculates audio-aware usage cost', () => {
    const result = calculateAudioUsageCost(
      {
        prompt_tokens_details: { text_tokens: 1000, audio_tokens: 2000 },
        completion_tokens_details: { text_tokens: 500, audio_tokens: 1000 },
      },
      { prompt: 2, completion: 4, audioPrompt: 1, audioCompletion: 3 },
    );

    assert.deepEqual(result, {
      promptCost: 2,
      completionCost: 2,
      audioPromptCost: 2,
      audioCompletionCost: 3,
      totalCost: 9,
    });
  });

  it('uses rejected prediction tokens for cost when present', () => {
    assert.equal(
      getOutputTokensForCostCalculation(
        {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          completion_tokens_details: {
            accepted_prediction_tokens: 0,
            audio_tokens: 0,
            reasoning_tokens: 0,
            rejected_prediction_tokens: 7,
            text_tokens: 20,
          },
          prompt_tokens_details: {
            audio_tokens: 0,
            cached_tokens: 0,
            text_tokens: 10,
          },
        },
        5,
      ),
      7,
    );
  });
});

describe('streamChatResponse helpers', () => {
  it('accumulates streamed tool calls and parses partial arguments when valid', () => {
    const functionCalls: any[][] = [];

    applyToolCallDeltas(functionCalls, 0, [
      {
        index: 0,
        id: 'call_1',
        function: {
          name: 'sum',
          arguments: '{"a":',
        },
      },
    ]);
    applyToolCallDeltas(functionCalls, 0, [
      {
        index: 0,
        function: {
          arguments: '1}',
        },
      },
    ]);

    assert.equal(functionCalls[0]![0]!.id, 'call_1');
    assert.equal(functionCalls[0]![0]!.name, 'sum');
    assert.equal(functionCalls[0]![0]!.arguments, '{"a":1}');
    assert.deepEqual(functionCalls[0]![0]!.lastParsedArguments, { a: 1 });
  });

  it('maps accumulated function calls into single-response outputs', () => {
    const output: any = {};

    applyStreamedFunctionCallOutputs(
      output,
      [[{ type: 'function', id: 'call_1', name: 'sum', arguments: '{"a":1}', lastParsedArguments: { a: 1 } }]],
      false,
      false,
    );

    assert.deepEqual(output['function-call'], {
      type: 'object',
      value: { id: 'call_1', name: 'sum', arguments: { a: 1 } },
    });
  });

  it('creates assistant message output with function call strings preserved', () => {
    const output = createAssistantMessagesOutput(
      [{ type: 'user', message: 'hello' }],
      'world',
      [{ type: 'function', id: 'call_1', name: 'sum', arguments: '{"a":1}', lastParsedArguments: { a: 1 } }],
    );

    assert.equal(output.type, 'chat-message[]');
    assert.deepEqual(output.value[1], {
      type: 'assistant',
      message: 'world',
      function_call: { id: 'call_1', name: 'sum', arguments: '{"a":1}' },
      function_calls: [{ id: 'call_1', name: 'sum', arguments: '{"a":1}' }],
    });
  });

  it('supports provider-specific singular function call behavior', () => {
    const functionCalls = [
      { type: 'function' as const, id: 'call_1', name: 'sum', arguments: '{"a":1}' },
      { type: 'function' as const, id: 'call_2', name: 'mul', arguments: '{"b":2}' },
    ];

    const anthropicOutput = createAssistantMessagesOutput([{ type: 'user', message: 'hello' }], 'world', functionCalls, {
      functionCallMode: 'only',
    });
    const googleOutput = createAssistantMessagesOutput([{ type: 'user', message: 'hello' }], 'world', functionCalls, {
      functionCallMode: 'never',
    });

    assert.equal(anthropicOutput.value[1]?.function_call, undefined);
    assert.equal(googleOutput.value[1]?.function_call, undefined);
    assert.deepEqual(googleOutput.value[1]?.function_calls, [
      { id: 'call_1', name: 'sum', arguments: '{"a":1}' },
      { id: 'call_2', name: 'mul', arguments: '{"b":2}' },
    ]);
  });
});
