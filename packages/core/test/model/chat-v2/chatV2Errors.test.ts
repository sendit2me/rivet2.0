import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeChatV2ProviderError } from '../../../src/model/chat-v2/chatV2Errors.js';

function createApiError(overrides: Partial<Error & Record<string, unknown>> = {}) {
  const error = new Error('Not Found') as Error & Record<string, unknown>;
  error.name = 'AI_APICallError';
  Object.assign(error, {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    statusCode: 404,
    responseBody: JSON.stringify({
      error: {
        message: 'Model llama-does-not-exist does not exist.',
      },
    }),
    ...overrides,
  });
  return error;
}

describe('normalizeChatV2ProviderError', () => {
  it('turns provider 404 errors into model and endpoint guidance', () => {
    const normalized = normalizeChatV2ProviderError(createApiError(), {
      provider: 'custom',
      modelId: 'llama-does-not-exist',
    });

    assert.ok(normalized instanceof Error);
    assert.equal(normalized.name, 'LLM Chat v2 error');
    assert.match(normalized.message, /404 Not Found/);
    assert.match(normalized.message, /Provider: Custom provider/);
    assert.match(normalized.message, /Model: llama-does-not-exist/);
    assert.match(normalized.message, /Provider base URL/);
    assert.match(normalized.message, /Model llama-does-not-exist does not exist/);
    assert.doesNotMatch(normalized.message, /AI_APICallError/);
  });

  it('does not include endpoint query strings in formatted API errors', () => {
    const normalized = normalizeChatV2ProviderError(
      createApiError({
        url: 'https://api.example.test/v1/chat/completions?api_key=secret#fragment',
      }),
      {
        provider: 'custom',
        modelId: 'wrong-model',
      },
    );

    assert.ok(normalized instanceof Error);
    assert.match(normalized.message, /Endpoint: https:\/\/api\.example\.test\/v1\/chat\/completions/);
    assert.doesNotMatch(normalized.message, /secret/);
    assert.doesNotMatch(normalized.message, /fragment/);
  });

  it('does not dump provider data objects without a clear message', () => {
    const normalized = normalizeChatV2ProviderError(
      createApiError({
        statusCode: 401,
        data: {
          requestBodyValues: {
            apiKey: 'sk-secret-from-request',
          },
        },
        responseBody: JSON.stringify({
          requestBodyValues: {
            apiKey: 'sk-secret-from-response',
          },
        }),
      }),
      {
        provider: 'openai',
        modelId: 'gpt-5',
      },
    );

    assert.ok(normalized instanceof Error);
    assert.match(normalized.message, /401 Unauthorized/);
    assert.match(normalized.message, /API key source/);
    assert.doesNotMatch(normalized.message, /sk-secret/);
    assert.doesNotMatch(normalized.message, /requestBodyValues/);
  });

  it('uses scalar nested provider errors without dumping sibling data', () => {
    const normalized = normalizeChatV2ProviderError(
      createApiError({
        data: {
          error: 'Model is not available.',
          requestBodyValues: {
            apiKey: 'sk-secret-from-request',
          },
        },
        responseBody: undefined,
      }),
      {
        provider: 'custom',
        modelId: 'wrong-model',
      },
    );

    assert.ok(normalized instanceof Error);
    assert.match(normalized.message, /Provider message: Model is not available/);
    assert.doesNotMatch(normalized.message, /sk-secret/);
    assert.doesNotMatch(normalized.message, /requestBodyValues/);
  });

  it('adds guidance for known SDK API key errors', () => {
    const error = new Error('Missing API key.');
    error.name = 'LoadAPIKeyError';

    const normalized = normalizeChatV2ProviderError(error, {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4',
    });

    assert.ok(normalized instanceof Error);
    assert.match(normalized.message, /LLM API key could not be loaded/);
    assert.match(normalized.message, /Provider: Anthropic/);
    assert.match(normalized.message, /configured provider credentials/);
  });

  it('keeps unrelated runtime errors unchanged', () => {
    const error = new Error('Tool execution failed.');

    assert.equal(
      normalizeChatV2ProviderError(error, {
        provider: 'openai',
        modelId: 'gpt-5',
      }),
      error,
    );
  });

  it('keeps abort errors unchanged', () => {
    const error = new Error('Aborted.');
    error.name = 'AbortError';

    assert.equal(
      normalizeChatV2ProviderError(error, {
        provider: 'openai',
        modelId: 'gpt-5',
      }),
      error,
    );
  });
});
