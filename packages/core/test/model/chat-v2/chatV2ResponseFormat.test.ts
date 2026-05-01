import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createChatV2ResponseOutput,
  resolveChatV2ResponseFormatParameters,
  type ChatV2ResponseFormatData,
} from '../../../src/model/chat-v2/chatV2ResponseFormat.js';
import type { DataValue, GptFunction } from '../../../src/model/DataValue.js';
import type { Inputs } from '../../../src/model/GraphProcessor.js';

function resolve(data: ChatV2ResponseFormatData, inputs: Inputs = {}) {
  return resolveChatV2ResponseFormatParameters(data, inputs);
}

describe('chat v2 response format helpers', () => {
  it('omits response output by default', () => {
    assert.equal(resolve({ responseFormat: '' }), undefined);
    assert.equal(resolve({}), undefined);
  });

  it('resolves JSON response metadata from settings or inputs', () => {
    const inputs = {
      responseSchemaName: { type: 'string', value: 'answer' },
      responseSchemaDescription: { type: 'string', value: 'Short answer object' },
    } satisfies Inputs;

    assert.deepEqual(
      resolve(
        {
          responseFormat: 'json',
          responseSchemaName: 'ignored',
          useResponseSchemaNameInput: true,
          responseSchemaDescription: 'ignored',
          useResponseSchemaDescriptionInput: true,
        },
        inputs,
      ),
      {
        responseFormat: 'json',
        schemaName: 'answer',
        schemaDescription: 'Short answer object',
      },
    );
  });

  it('uses object input values as JSON schema parameters', () => {
    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
      required: ['answer'],
    };

    assert.deepEqual(
      resolve(
        {
          responseFormat: 'json_schema',
          responseSchemaName: 'answer_schema',
        },
        {
          responseSchema: { type: 'object', value: schema } satisfies DataValue,
        },
      ),
      {
        responseFormat: 'json_schema',
        schema,
        schemaName: 'answer_schema',
        schemaDescription: undefined,
      },
    );
  });

  it('uses gpt-function parameters as JSON schema parameters', () => {
    const gptFunction: GptFunction = {
      name: 'answer_schema',
      description: 'Answer schema',
      parameters: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
        },
      },
    };

    assert.deepEqual(
      resolve(
        {
          responseFormat: 'json_schema',
        },
        {
          responseSchema: { type: 'gpt-function', value: gptFunction } satisfies DataValue,
        },
      ),
      {
        responseFormat: 'json_schema',
        schema: gptFunction.parameters,
        schemaName: 'response_schema',
        schemaDescription: undefined,
      },
    );
  });

  it('creates Vercel output descriptors for supported response formats', () => {
    assert.ok(createChatV2ResponseOutput({ responseFormat: 'text' }));
    assert.ok(createChatV2ResponseOutput({ responseFormat: 'json' }));
    assert.ok(
      createChatV2ResponseOutput({
        responseFormat: 'json_schema',
        schemaName: 'answer_schema',
        schema: { type: 'object', properties: { answer: { type: 'string' } } },
      }),
    );
  });
});
