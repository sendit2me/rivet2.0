import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createChatV2Model, resolveChatV2ProviderConfig } from '../../../src/model/chat-v2/providerOptions.js';

describe('resolveChatV2ProviderConfig', () => {
  it('derives OpenAI baseURL and merges global and resolved headers', async () => {
    const result = await resolveChatV2ProviderConfig(
      'openai',
      'gpt-5',
      {
        settings: {
          openAiEndpoint: 'https://example.test/v1/chat/completions',
          chatNodeHeaders: {
            'x-global': 'global',
          },
        },
        getPluginConfig: () => undefined,
        getChatNodeEndpoint: async (endpoint) => ({
          endpoint: endpoint.replace('example.test', 'proxy.test'),
          headers: {
            'x-proxy': 'proxy',
          },
        }),
      } as any,
      {
        headers: {
          'x-node': 'node',
        },
      },
    );

    assert.equal(result.baseURL, 'https://proxy.test/v1');
    assert.deepEqual(result.headers, {
      'x-global': 'global',
      'x-node': 'node',
      'x-proxy': 'proxy',
    });
  });
});

describe('createChatV2Model', () => {
  it('enables structured outputs on custom OpenAI-compatible chat models', async () => {
    const model = createChatV2Model(
      'custom',
      'gpt-oss-120b',
      {
        settings: {},
        getPluginConfig: () => undefined,
      } as any,
      {
        apiKey: 'test-key',
        baseURL: 'https://api.example.test/v1',
      },
    ) as { supportsStructuredOutputs?: boolean };

    assert.equal(model.supportsStructuredOutputs, true);

    const responseSchema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
    };
    const { args, warnings } = await (
      model as unknown as {
        getArgs(options: unknown): Promise<{ args: { response_format?: unknown }; warnings: unknown[] }>;
      }
    ).getArgs({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Answer briefly.' }] }],
      responseFormat: {
        type: 'json',
        schema: responseSchema,
        name: 'answer_schema',
        description: 'Answer payload',
      },
    });

    assert.deepEqual(warnings, []);
    assert.deepEqual(args.response_format, {
      type: 'json_schema',
      json_schema: {
        schema: responseSchema,
        name: 'answer_schema',
        description: 'Answer payload',
      },
    });
  });
});
