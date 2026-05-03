import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantChatMessage } from '@rivet2/rivet-core';

import { getRenderableAssistantFunctionCall } from './chatMessageRenderUtils.js';

test('assistant messages with empty function_calls have no renderable function call section', () => {
  assert.equal(
    getRenderableAssistantFunctionCall(
      assistantMessage({
        function_call: undefined,
        function_calls: [],
      }),
    ),
    undefined,
  );
});

test('assistant messages with function_calls render the plural section', () => {
  assert.deepEqual(
    getRenderableAssistantFunctionCall(
      assistantMessage({
        function_call: undefined,
        function_calls: [{ name: 'lookup', arguments: '{"query":"foo"}', id: 'call_1' }],
      }),
    ),
    {
      type: 'multiple',
      functionCalls: [{ name: 'lookup', arguments: '{"query":"foo"}', id: 'call_1' }],
    },
  );
});

test('assistant messages with legacy function_call render the singular section', () => {
  assert.deepEqual(
    getRenderableAssistantFunctionCall(
      assistantMessage({
        function_call: { name: 'lookup', arguments: '{"query":"foo"}', id: 'call_1' },
        function_calls: undefined,
      }),
    ),
    {
      type: 'single',
      functionCall: { name: 'lookup', arguments: '{"query":"foo"}', id: 'call_1' },
    },
  );
});

function assistantMessage(
  overrides: Pick<AssistantChatMessage, 'function_call' | 'function_calls'>,
): AssistantChatMessage {
  return {
    type: 'assistant',
    message: 'Hi!',
    ...overrides,
  };
}
