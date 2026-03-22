import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type { LanguageModelUsage } from 'ai';
import type { Outputs } from '../../../src/model/GraphProcessor.js';
import type { PortId } from '../../../src/model/NodeBase.js';
import type { ChatV2Model, ChatV2ProviderMetadata, ChatV2StreamExecutor, ChatV2StreamPart } from '../../../src/model/chat-v2/chatV2Types.js';
import { runChatV2Pipeline } from '../../../src/model/chat-v2/chatV2Pipeline.js';
import { streamChatV2 } from '../../../src/model/chat-v2/aiSdkBridge.js';
import { calculateChatV2Cost } from '../../../src/model/chat-v2/modelRegistry.js';

async function* mockStream(parts: ChatV2StreamPart[]): AsyncGenerator<ChatV2StreamPart> {
  for (const part of parts) {
    yield part;
  }
}

function createMockModel(): ChatV2Model {
  return {} as ChatV2Model;
}

describe('streamChatV2', () => {
  it('adapts a mocked stream executor into Rivet-friendly results', async () => {
    const usage: LanguageModelUsage = {
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
      inputTokenDetails: {
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
        noCacheTokens: 7,
      },
      outputTokenDetails: {
        reasoningTokens: 1,
        textTokens: 3,
      },
    };
    const providerMetadata: ChatV2ProviderMetadata = {
      openai: {
        responseId: 'resp_123',
      },
    };
    const executeStream: ChatV2StreamExecutor = async () => ({
      fullStream: mockStream([
        { type: 'text-start', id: 'text_1' },
        { type: 'text-delta', id: 'text_1', text: 'Hello' },
        { type: 'text-end', id: 'text_1' },
        {
          type: 'finish',
          finishReason: 'stop',
          rawFinishReason: undefined,
          totalUsage: usage,
        },
      ]),
      finishReason: 'stop',
      providerMetadata,
    });

    const result = await streamChatV2({
      model: createMockModel(),
      messages: [],
      executeStream,
    });

    assert.equal(result.responseText, 'Hello');
    assert.equal(result.finishReason, 'stop');
    assert.deepEqual(result.providerMetadata, providerMetadata);
    assert.equal(result.usage?.inputTokens, 10);
  });
});

describe('runChatV2Pipeline', () => {
  it('builds common outputs from a mocked streamed response', async () => {
    const partialOutputs: Outputs[] = [];
    const usage: LanguageModelUsage = {
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      inputTokenDetails: {
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
        noCacheTokens: 8,
      },
      outputTokenDetails: {
        reasoningTokens: 2,
        textTokens: 6,
      },
    };
    const executeStream: ChatV2StreamExecutor = async () => ({
      fullStream: mockStream([
        { type: 'text-start', id: 'text_1' },
        { type: 'text-delta', id: 'text_1', text: 'Hello' },
        { type: 'text-delta', id: 'text_1', text: ' world' },
        { type: 'text-end', id: 'text_1' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'lookup_weather',
          input: { city: 'Paris' },
        } as ChatV2StreamPart,
        {
          type: 'finish',
          finishReason: 'tool-calls',
          rawFinishReason: undefined,
          totalUsage: usage,
        },
      ]),
      finishReason: 'tool-calls',
      providerMetadata: {
        openai: {
          responseId: 'resp_456',
        },
      },
    });

    const result = await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-4o',
      prompt: { type: 'string', value: 'Tell me the weather.' },
      systemPrompt: { type: 'string', value: 'Be concise.' },
      outputUsage: true,
      context: {
        signal: new AbortController().signal,
        onPartialOutputs: (outputs) => {
          partialOutputs.push(outputs);
        },
      },
      executeStream,
    });

    assert.equal(result.response, 'Hello world');
    assert.equal(result.reasoning, '');
    assert.equal(result.finishReason, 'tool-calls');
    assert.equal(result.requestMessages.length, 2);
    assert.equal(result.requestMessages[0]?.type, 'system');
    assert.equal(result.requestMessages[1]?.type, 'user');
    assert.equal(result.functionCalls.length, 1);
    assert.equal(result.functionCalls[0]?.name, 'lookup_weather');
    assert.equal(result.allMessages.length, 3);

    assert.equal(result.commonOutputs['response' as PortId]?.type, 'string');
    assert.equal(result.commonOutputs['response' as PortId]?.value, 'Hello world');
    assert.equal(result.commonOutputs['responseTokens' as PortId]?.value, 8);
    assert.deepEqual(result.commonOutputs['function-calls' as PortId]?.value, [
      {
        name: 'lookup_weather',
        arguments: { city: 'Paris' },
        id: 'call_1',
      },
    ]);

    assert.deepEqual(result.usage, {
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      cachedTokens: 4,
      reasoningTokens: 2,
      totalCost: calculateChatV2Cost('openai', 'gpt-4o', 12, 8),
    });
    assert.deepEqual(result.commonOutputs['usage' as PortId]?.value, result.usage);

    assert.equal(partialOutputs.length, 3);
    assert.equal(partialOutputs[0]?.['response' as PortId]?.value, 'Hello');
    assert.equal(partialOutputs[1]?.['response' as PortId]?.value, 'Hello world');
    assert.deepEqual(partialOutputs[2]?.['function-calls' as PortId]?.value, [
      {
        name: 'lookup_weather',
        arguments: { city: 'Paris' },
        id: 'call_1',
      },
    ]);
  });
});
