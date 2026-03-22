import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveChatV2ProviderConfig } from '../../../src/model/chat-v2/providerOptions.js';

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
