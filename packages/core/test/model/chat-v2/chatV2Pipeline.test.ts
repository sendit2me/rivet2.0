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

  it('forwards tool choice to the AI SDK stream executor', async () => {
    let capturedToolChoice: unknown;
    const executeStream: ChatV2StreamExecutor = async (args) => {
      capturedToolChoice = args.toolChoice;

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: 'Hello' },
          { type: 'text-end', id: 'text_1' },
        ]),
      };
    };

    await streamChatV2({
      model: createMockModel(),
      messages: [],
      toolChoice: 'required',
      executeStream,
    });

    assert.equal(capturedToolChoice, 'required');
  });

  it('forwards provider options to the AI SDK stream executor', async () => {
    let capturedProviderOptions: unknown;
    const providerOptions = {
      openai: {
        parallelToolCalls: false,
      },
    };
    const executeStream: ChatV2StreamExecutor = async (args) => {
      capturedProviderOptions = args.providerOptions;

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: 'Hello' },
          { type: 'text-end', id: 'text_1' },
        ]),
      };
    };

    await streamChatV2({
      model: createMockModel(),
      messages: [],
      providerOptions,
      executeStream,
    });

    assert.deepEqual(capturedProviderOptions, providerOptions);
  });

  it('forwards generation settings to the AI SDK stream executor', async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const executeStream: ChatV2StreamExecutor = async (args) => {
      capturedArgs = args as Record<string, unknown>;

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: 'Hello' },
          { type: 'text-end', id: 'text_1' },
        ]),
      };
    };

    await streamChatV2({
      model: createMockModel(),
      messages: [],
      maxTokens: 100,
      temperature: 0.4,
      topP: 0.8,
      topK: 20,
      presencePenalty: 0.2,
      frequencyPenalty: 0.3,
      stopSequences: ['END'],
      seed: 123,
      executeStream,
    });

    assert.equal(capturedArgs?.maxOutputTokens, 100);
    assert.equal(capturedArgs?.temperature, 0.4);
    assert.equal(capturedArgs?.topP, 0.8);
    assert.equal(capturedArgs?.topK, 20);
    assert.equal(capturedArgs?.presencePenalty, 0.2);
    assert.equal(capturedArgs?.frequencyPenalty, 0.3);
    assert.deepEqual(capturedArgs?.stopSequences, ['END']);
    assert.equal(capturedArgs?.seed, 123);
  });

  it('forwards response output to the AI SDK stream executor', async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const responseOutput = { name: 'json' };
    const executeStream: ChatV2StreamExecutor = async (args) => {
      capturedArgs = args as Record<string, unknown>;

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: '{}' },
          { type: 'text-end', id: 'text_1' },
        ]),
      };
    };

    await streamChatV2({
      model: createMockModel(),
      messages: [],
      responseOutput,
      executeStream,
    });

    assert.equal(capturedArgs?.output, responseOutput);
    assert.equal('tools' in capturedArgs!, false);
  });

  it('omits undefined optional AI SDK arguments instead of forwarding empty request-shape hints', async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const executeStream: ChatV2StreamExecutor = async (args) => {
      capturedArgs = args as Record<string, unknown>;

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: 'Hello' },
          { type: 'text-end', id: 'text_1' },
        ]),
      };
    };

    await streamChatV2({
      model: createMockModel(),
      messages: [],
      executeStream,
    });

    assert.ok(capturedArgs);
    assert.equal('tools' in capturedArgs, false);
    assert.equal('toolChoice' in capturedArgs, false);
    assert.equal('output' in capturedArgs, false);
    assert.equal('providerOptions' in capturedArgs, false);
    assert.equal('maxOutputTokens' in capturedArgs, false);
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

  it('excludes the function-calls output when tools are enabled but the model returns no tool calls', async () => {
    const executeStream: ChatV2StreamExecutor = async () => ({
      fullStream: mockStream([
        { type: 'text-start', id: 'text_1' },
        { type: 'text-delta', id: 'text_1', text: 'Final answer' },
        { type: 'text-end', id: 'text_1' },
        {
          type: 'finish',
          finishReason: 'stop',
          rawFinishReason: undefined,
        },
      ]),
      finishReason: 'stop',
    });

    const result = await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-4o',
      prompt: { type: 'string', value: 'Answer normally.' },
      includeFunctionCalls: true,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(result.response, 'Final answer');
    assert.equal(result.functionCalls.length, 0);
    assert.equal((result.allMessages.at(-1) as any)?.function_calls, undefined);
    assert.deepEqual(result.commonOutputs['function-calls' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
  });

  it('emits reasoning output when requested and the stream exposes reasoning text', async () => {
    const executeStream: ChatV2StreamExecutor = async () => ({
      fullStream: mockStream([
        { type: 'reasoning-start', id: 'reasoning_1' } as ChatV2StreamPart,
        { type: 'reasoning-delta', id: 'reasoning_1', text: 'Think first.' } as ChatV2StreamPart,
        { type: 'reasoning-end', id: 'reasoning_1' } as ChatV2StreamPart,
        { type: 'text-start', id: 'text_1' },
        { type: 'text-delta', id: 'text_1', text: 'Final answer' },
        { type: 'text-end', id: 'text_1' },
      ]),
    });

    const result = await runChatV2Pipeline({
      provider: 'custom',
      model: createMockModel(),
      modelId: 'reasoning-model',
      prompt: { type: 'string', value: 'Think.' },
      outputReasoning: true,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(result.reasoning, 'Think first.');
    assert.deepEqual(result.commonOutputs['reasoning' as PortId], {
      type: 'string',
      value: 'Think first.',
    });
  });

  it('forwards function tool choice in the AI SDK tool-choice format', async () => {
    let capturedToolChoice: unknown;
    const executeStream: ChatV2StreamExecutor = async (args) => {
      capturedToolChoice = args.toolChoice;

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: 'Final answer' },
          { type: 'text-end', id: 'text_1' },
          {
            type: 'finish',
            finishReason: 'stop',
            rawFinishReason: undefined,
          },
        ]),
      };
    };

    await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-4o',
      prompt: { type: 'string', value: 'Use the lookup tool.' },
      functions: [
        {
          name: 'lookup_weather',
          description: 'Looks up weather.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      ],
      toolChoice: {
        type: 'tool',
        toolName: 'lookup_weather',
      },
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.deepEqual(capturedToolChoice, {
      type: 'tool',
      toolName: 'lookup_weather',
    });
  });

  it('forwards generation settings from the pipeline to the stream executor', async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const executeStream: ChatV2StreamExecutor = async (args) => {
      capturedArgs = args as Record<string, unknown>;

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: 'Final answer' },
          { type: 'text-end', id: 'text_1' },
        ]),
      };
    };

    await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-4o',
      prompt: { type: 'string', value: 'Answer normally.' },
      maxTokens: 100,
      temperature: 0.4,
      topP: 0.8,
      topK: 20,
      presencePenalty: 0.2,
      frequencyPenalty: 0.3,
      stopSequences: ['END'],
      seed: 123,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(capturedArgs?.maxOutputTokens, 100);
    assert.equal(capturedArgs?.temperature, 0.4);
    assert.equal(capturedArgs?.topP, 0.8);
    assert.equal(capturedArgs?.topK, 20);
    assert.equal(capturedArgs?.presencePenalty, 0.2);
    assert.equal(capturedArgs?.frequencyPenalty, 0.3);
    assert.deepEqual(capturedArgs?.stopSequences, ['END']);
    assert.equal(capturedArgs?.seed, 123);
  });

  it('forwards response output from the pipeline to the stream executor', async () => {
    let capturedResponseOutput: unknown;
    const responseOutput = { name: 'json' };
    const executeStream: ChatV2StreamExecutor = async (args) => {
      capturedResponseOutput = (args as Record<string, unknown>).output;

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: '{}' },
          { type: 'text-end', id: 'text_1' },
        ]),
      };
    };

    await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-4o',
      prompt: { type: 'string', value: 'Answer normally.' },
      responseOutput,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(capturedResponseOutput, responseOutput);
  });
});
