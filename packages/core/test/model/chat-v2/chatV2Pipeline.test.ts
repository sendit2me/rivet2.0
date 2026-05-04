import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type { LanguageModelUsage } from 'ai';
import type { Outputs } from '../../../src/model/GraphProcessor.js';
import type { PortId } from '../../../src/model/NodeBase.js';
import type {
  ChatV2Model,
  ChatV2ProviderMetadata,
  ChatV2StreamExecutor,
  ChatV2StreamPart,
} from '../../../src/model/chat-v2/chatV2Types.js';
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
      requestStatus: 201,
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
    assert.equal(result.requestStatus, 201);
  });

  it('handles unused AI SDK metadata promise rejections when the stream fails', async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const executeStream: ChatV2StreamExecutor = async () => ({
        fullStream: mockStream([
          {
            type: 'error',
            error: new TypeError('Failed to fetch'),
          } as ChatV2StreamPart,
        ]),
        finishReason: Promise.reject(new Error('No output generated. Check the stream for errors.')),
        usage: Promise.reject(new Error('No usage generated. Check the stream for errors.')),
      });

      await assert.rejects(
        () =>
          streamChatV2({
            model: createMockModel(),
            messages: [],
            executeStream,
          }),
        /Failed to fetch/,
      );
      await new Promise((resolve) => setImmediate(resolve));

      assert.deepEqual(unhandledRejections, []);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
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
  it('retries Vercel provider stream errors with non-200 status codes before succeeding', async () => {
    let attempt = 0;
    const executeStream: ChatV2StreamExecutor = async () => {
      attempt += 1;

      if (attempt === 1) {
        const error = new Error('Provider unavailable') as Error & { statusCode: number };
        error.name = 'AI_APICallError';
        error.statusCode = 503;

        return {
          fullStream: mockStream([
            {
              type: 'error',
              error,
            } as ChatV2StreamPart,
          ]),
        };
      }

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: 'Recovered' },
          { type: 'text-end', id: 'text_1' },
        ]),
      };
    };

    const result = await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-5',
      prompt: { type: 'string', value: 'Hello' },
      outputRequestStatus: true,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(attempt, 2);
    assert.equal(result.response, 'Recovered');
    assert.equal(result.requestStatus, 200);
    assert.deepEqual(result.commonOutputs['requestStatus' as PortId], {
      type: 'number[]',
      value: [503, 200],
    });
    assert.equal('requestStatuses' in result.commonOutputs, false);
    const requestErrors = result.commonOutputs['requestError' as PortId];
    assert.equal(requestErrors?.type, 'string[]');
    assert.ok(Array.isArray(requestErrors?.value));
    assert.equal(requestErrors.value.length, 1);
    assert.match(requestErrors.value[0]!, /503 HTTP error/);
    assert.equal('requestErrors' in result.commonOutputs, false);
  });

  it('normalizes the final Vercel status error after retry attempts are exhausted', async () => {
    let attempt = 0;
    const executeStream: ChatV2StreamExecutor = async () => {
      attempt += 1;
      const error = new Error('Rate limited') as Error & { statusCode: number };
      error.name = 'AI_APICallError';
      error.statusCode = 429;

      throw error;
    };

    await assert.rejects(
      () =>
        runChatV2Pipeline({
          provider: 'anthropic',
          model: createMockModel(),
          modelId: 'claude-sonnet-4',
          prompt: { type: 'string', value: 'Hello' },
          retryOnNon200: true,
          retryOnNon200RepeatTimes: 1,
          context: {
            signal: new AbortController().signal,
          },
          executeStream,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, 'LLM Chat error');
        assert.match(error.message, /429 Rate Limited/);
        assert.equal((error as Error & { statusCode?: number }).statusCode, 429);
        return true;
      },
    );

    assert.equal(attempt, 2);
  });

  it('does not start a zero-cooldown retry after cancellation', async () => {
    let attempt = 0;
    const abortController = new AbortController();
    const executeStream: ChatV2StreamExecutor = async () => {
      attempt += 1;
      const error = new Error('Provider unavailable') as Error & { statusCode: number };
      error.name = 'AI_APICallError';
      error.statusCode = 503;
      throw error;
    };

    abortController.abort();

    await assert.rejects(
      () =>
        runChatV2Pipeline({
          provider: 'openai',
          model: createMockModel(),
          modelId: 'gpt-5',
          prompt: { type: 'string', value: 'Hello' },
          retryOnNon200: true,
          retryOnNon200RepeatTimes: 1,
          retryOnNon200CooldownMs: 0,
          context: {
            signal: abortController.signal,
          },
          executeStream,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, 'AbortError');
        return true;
      },
    );

    assert.equal(attempt, 1);
  });

  it('returns request status outputs for Vercel status failures when requested', async () => {
    let attempt = 0;
    const executeStream: ChatV2StreamExecutor = async () => {
      attempt += 1;
      const error = new Error('Rate limited') as Error & { statusCode: number };
      error.name = 'AI_APICallError';
      error.statusCode = 429;

      throw error;
    };

    const result = await runChatV2Pipeline({
      provider: 'anthropic',
      model: createMockModel(),
      modelId: 'claude-sonnet-4',
      prompt: { type: 'string', value: 'Hello' },
      outputRequestStatus: true,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(attempt, 2);
    assert.equal(result.requestStatus, 429);
    assert.deepEqual(result.commonOutputs['requestStatus' as PortId], {
      type: 'number[]',
      value: [429, 429],
    });
    assert.equal('requestStatuses' in result.commonOutputs, false);
    const requestErrors = result.commonOutputs['requestError' as PortId];
    assert.equal(requestErrors?.type, 'string[]');
    assert.ok(Array.isArray(requestErrors?.value));
    assert.equal(requestErrors.value.length, 2);
    assert.match(requestErrors.value[0]!, /429 Rate Limited/);
    assert.match(requestErrors.value[1]!, /429 Rate Limited/);
    assert.equal('requestErrors' in result.commonOutputs, false);
    assert.deepEqual(result.commonOutputs['response' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
  });

  it('returns the final response error when a stream completes with a non-200 status after retries', async () => {
    let attempt = 0;
    const executeStream: ChatV2StreamExecutor = async () => {
      attempt += 1;

      return {
        fullStream: mockStream([
          { type: 'text-start', id: 'text_1' },
          { type: 'text-delta', id: 'text_1', text: `Still failing ${attempt}` },
          { type: 'text-end', id: 'text_1' },
        ]),
        requestStatus: 503,
      };
    };

    const result = await runChatV2Pipeline({
      provider: 'custom',
      model: createMockModel(),
      modelId: 'custom-model',
      prompt: { type: 'string', value: 'Hello' },
      outputRequestStatus: true,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(attempt, 2);
    assert.equal(result.response, 'Still failing 2');
    assert.equal(result.requestStatus, 503);
    assert.deepEqual(result.commonOutputs['requestStatus' as PortId], {
      type: 'number[]',
      value: [503, 503],
    });
    assert.equal('requestStatuses' in result.commonOutputs, false);
    const requestErrors = result.commonOutputs['requestError' as PortId];
    assert.equal(requestErrors?.type, 'string[]');
    assert.ok(Array.isArray(requestErrors?.value));
    assert.equal(requestErrors.value.length, 2);
    assert.match(requestErrors.value[0]!, /503 HTTP error/);
    assert.match(requestErrors.value[1]!, /503 HTTP error/);
    assert.equal('requestErrors' in result.commonOutputs, false);
  });

  it('returns per-attempt request status and error outputs for retried string-shaped Vercel status failures', async () => {
    let attempt = 0;
    const executeStream: ChatV2StreamExecutor = async () => {
      attempt += 1;
      const error = new Error(`Incorrect API key on attempt ${attempt}`) as Error & {
        responseBody: string;
        statusCode: string;
        url: string;
      };
      error.name = 'AI_APICallError';
      error.statusCode = '401';
      error.url = 'https://api.openai.com/v1/responses';
      error.responseBody = JSON.stringify({
        error: {
          message: `Incorrect API key provided on attempt ${attempt}.`,
        },
      });

      throw error;
    };

    const result = await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-5.4-mini',
      prompt: { type: 'string', value: 'Hello' },
      outputRequestStatus: true,
      retryOnNon200: true,
      retryOnNon200RepeatTimes: 1,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(attempt, 2);
    assert.equal(result.requestStatus, 401);
    assert.deepEqual(result.commonOutputs['requestStatus' as PortId], {
      type: 'number[]',
      value: [401, 401],
    });
    assert.equal('requestStatuses' in result.commonOutputs, false);
    const requestErrors = result.commonOutputs['requestError' as PortId];
    assert.equal(requestErrors?.type, 'string[]');
    assert.ok(Array.isArray(requestErrors?.value));
    assert.equal(requestErrors.value.length, 2);
    assert.match(requestErrors.value[0]!, /401 Unauthorized/);
    assert.match(requestErrors.value[0]!, /attempt 1/);
    assert.match(requestErrors.value[1]!, /401 Unauthorized/);
    assert.match(requestErrors.value[1]!, /attempt 2/);
    assert.equal('requestErrors' in result.commonOutputs, false);
    assert.deepEqual(result.commonOutputs['response' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
  });

  it('returns request status outputs for string-shaped Vercel status failures when requested', async () => {
    const executeStream: ChatV2StreamExecutor = async () => {
      const error = new Error('Incorrect API key') as Error & {
        responseBody: string;
        statusCode: string;
        url: string;
      };
      error.name = 'AI_APICallError';
      error.statusCode = '401';
      error.url = 'https://api.openai.com/v1/responses';
      error.responseBody = JSON.stringify({
        error: {
          message: 'Incorrect API key provided.',
        },
      });

      throw error;
    };

    const result = await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-5.4-mini',
      prompt: { type: 'string', value: 'Hello' },
      outputRequestStatus: true,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(result.requestStatus, 401);
    assert.deepEqual(result.commonOutputs['requestStatus' as PortId], {
      type: 'number',
      value: 401,
    });
    assert.equal(result.commonOutputs['requestError' as PortId]?.type, 'string');
    assert.match(String(result.commonOutputs['requestError' as PortId]?.value), /401 Unauthorized/);
    assert.match(String(result.commonOutputs['requestError' as PortId]?.value), /API key source/);
    assert.match(
      String(result.commonOutputs['requestError' as PortId]?.value),
      /Provider message: Incorrect API key provided/,
    );
    assert.deepEqual(result.commonOutputs['response' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
  });

  it('returns request-error output for browser fetch failures when status output is requested', async () => {
    const executeStream: ChatV2StreamExecutor = async () => {
      throw new TypeError('Failed to fetch');
    };

    const result = await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-5.4-mini',
      prompt: { type: 'string', value: 'Hello' },
      outputRequestStatus: true,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(result.requestStatus, undefined);
    assert.deepEqual(result.commonOutputs['requestStatus' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
    assert.equal(result.commonOutputs['requestError' as PortId]?.type, 'string');
    assert.match(
      String(result.commonOutputs['requestError' as PortId]?.value),
      /before Rivet could read an HTTP response/,
    );
    assert.match(String(result.commonOutputs['requestError' as PortId]?.value), /API key source/);
    assert.deepEqual(result.commonOutputs['response' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
  });

  it('returns request-error output for status-less Vercel API call failures when requested', async () => {
    const executeStream: ChatV2StreamExecutor = async () => {
      const error = new Error('Provider request failed') as Error & { url: string };
      error.name = 'AI_APICallError';
      error.url = 'https://api.openai.com/v1/responses';
      throw error;
    };

    const result = await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-5.4-mini',
      prompt: { type: 'string', value: 'Hello' },
      outputRequestStatus: true,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(result.requestStatus, undefined);
    assert.deepEqual(result.commonOutputs['requestStatus' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
    assert.equal(result.commonOutputs['requestError' as PortId]?.type, 'string');
    assert.match(String(result.commonOutputs['requestError' as PortId]?.value), /request failed/);
    assert.deepEqual(result.commonOutputs['response' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
  });

  it('keeps non-request SDK setup errors as node failures when request outputs are enabled', async () => {
    const executeStream: ChatV2StreamExecutor = async () => {
      const error = new Error('Missing API key.');
      error.name = 'LoadAPIKeyError';
      throw error;
    };

    await assert.rejects(
      () =>
        runChatV2Pipeline({
          provider: 'openai',
          model: createMockModel(),
          modelId: 'gpt-5.4-mini',
          prompt: { type: 'string', value: 'Hello' },
          outputRequestStatus: true,
          context: {
            signal: new AbortController().signal,
          },
          executeStream,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, 'LLM Chat error');
        assert.match(error.message, /LLM API key could not be loaded/);
        return true;
      },
    );
  });

  it('outputs the final provider request status when requested', async () => {
    const executeStream: ChatV2StreamExecutor = async () => ({
      fullStream: mockStream([
        { type: 'text-start', id: 'text_1' },
        { type: 'text-delta', id: 'text_1', text: 'Accepted' },
        { type: 'text-end', id: 'text_1' },
      ]),
      requestStatus: 202,
    });

    const result = await runChatV2Pipeline({
      provider: 'custom',
      model: createMockModel(),
      modelId: 'custom-model',
      prompt: { type: 'string', value: 'Hello' },
      outputRequestStatus: true,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(result.requestStatus, 202);
    assert.deepEqual(result.commonOutputs['requestStatus' as PortId], {
      type: 'number',
      value: 202,
    });
    assert.deepEqual(result.commonOutputs['requestError' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
  });

  it('defaults successful Vercel provider calls to request status 200 when no raw status is exposed', async () => {
    const executeStream: ChatV2StreamExecutor = async () => ({
      fullStream: mockStream([
        { type: 'text-start', id: 'text_1' },
        { type: 'text-delta', id: 'text_1', text: 'OK' },
        { type: 'text-end', id: 'text_1' },
      ]),
    });

    const result = await runChatV2Pipeline({
      provider: 'openai',
      model: createMockModel(),
      modelId: 'gpt-5',
      prompt: { type: 'string', value: 'Hello' },
      outputRequestStatus: true,
      context: {
        signal: new AbortController().signal,
      },
      executeStream,
    });

    assert.equal(result.requestStatus, 200);
    assert.deepEqual(result.commonOutputs['requestStatus' as PortId], {
      type: 'number',
      value: 200,
    });
    assert.deepEqual(result.commonOutputs['requestError' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
    });
  });

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

  it('excludes reasoning output when requested but the stream has no reasoning text', async () => {
    const executeStream: ChatV2StreamExecutor = async () => ({
      fullStream: mockStream([
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

    assert.equal(result.reasoning, '');
    assert.deepEqual(result.commonOutputs['reasoning' as PortId], {
      type: 'control-flow-excluded',
      value: undefined,
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
