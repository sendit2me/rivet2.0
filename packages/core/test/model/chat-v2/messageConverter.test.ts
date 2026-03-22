import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ChatMessage } from '../../../src/model/DataValue.js';
import { chatMessagesToModelMessages } from '../../../src/model/chat-v2/messageConverter.js';

describe('chatMessagesToModelMessages', () => {
  it('preserves Anthropic document metadata and cache breakpoints', async () => {
    const messages: ChatMessage[] = [
      {
        type: 'user',
        isCacheBreakpoint: true,
        message: [
          'Read this document',
          {
            type: 'document',
            title: 'Quarterly Report',
            context: 'Use citations when answering.',
            mediaType: 'application/pdf',
            data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
            enableCitations: true,
          },
        ],
      },
    ];

    const result = await chatMessagesToModelMessages(messages, {
      provider: 'anthropic',
      anthropicCacheControlTtl: '5m',
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.role, 'user');
    assert.ok(Array.isArray(result[0]?.content));

    const parts = result[0]?.content as any[];
    assert.equal(parts[0]?.type, 'text');
    assert.equal(parts[1]?.type, 'file');
    assert.equal(parts[1]?.filename, 'Quarterly Report');
    assert.deepEqual(parts[1]?.providerOptions?.anthropic, {
      citations: { enabled: true },
      title: 'Quarterly Report',
      context: 'Use citations when answering.',
      cacheControl: { type: 'ephemeral', ttl: '5m' },
    });
  });

  it('applies Anthropic cache breakpoint metadata to assistant tool calls', async () => {
    const messages: ChatMessage[] = [
      {
        type: 'assistant',
        isCacheBreakpoint: true,
        message: 'Let me check.',
        function_call: undefined,
        function_calls: [{ id: 'call_1', name: 'lookup_weather', arguments: '{"city":"Paris"}' }],
      },
    ];

    const result = await chatMessagesToModelMessages(messages, {
      provider: 'anthropic',
    });

    assert.equal(result[0]?.role, 'assistant');
    assert.ok(Array.isArray(result[0]?.content));

    const parts = result[0]?.content as any[];
    assert.equal(parts[1]?.type, 'tool-call');
    assert.deepEqual(parts[1]?.providerOptions?.anthropic?.cacheControl, {
      type: 'ephemeral',
    });
  });
});
