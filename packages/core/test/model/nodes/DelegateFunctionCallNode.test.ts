import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  DelegateFunctionCallNodeImpl,
  type DelegateFunctionCallNode,
  type InternalProcessContext,
  type Outputs,
  type PortId,
} from '../../../src/index.js';
import { applyStreamedFunctionCallOutputs } from '../../../src/model/chat/streamChatResponse.js';

function createNode(data: Partial<DelegateFunctionCallNode['data']> = {}) {
  return new DelegateFunctionCallNodeImpl({
    ...DelegateFunctionCallNodeImpl.create(),
    data: {
      ...DelegateFunctionCallNodeImpl.create().data,
      ...data,
    },
  });
}

function createContext(onExternalFunction: (argumentsValue: Record<string, unknown>) => string) {
  return {
    project: {
      graphs: {},
    },
    externalFunctions: {
      foo: (_context: InternalProcessContext, argumentsValue: Record<string, unknown>) =>
        onExternalFunction(argumentsValue),
    },
    signal: new AbortController().signal,
  } as unknown as InternalProcessContext;
}

function delegatedToolCallRecord(name: string, output: string, id = `call_${name}`) {
  return {
    delegatedToolCall: true,
    name,
    arguments: {},
    id,
    output,
    message: {
      type: 'function',
      message: output,
      name: id,
      toolName: name,
    },
  };
}

describe('DelegateFunctionCallNodeImpl', () => {
  it('delegates a direct function call object', async () => {
    const node = createNode();
    let receivedArguments: Record<string, unknown> | undefined;

    const result = await node.process(
      {
        ['function-call' as PortId]: {
          type: 'object',
          value: {
            name: 'foo',
            arguments: { value: 123 },
            id: 'call_1',
          },
        },
      },
      createContext((argumentsValue) => {
        receivedArguments = argumentsValue;
        return 'ok';
      }),
    );

    assert.deepEqual(receivedArguments, { value: 123 });
    assert.equal(result.output?.value, 'ok');
    assert.deepEqual(result.message?.value, {
      type: 'function',
      message: 'ok',
      name: 'call_1',
      toolName: 'foo',
    });
  });

  it('delegates the legacy Chat function-call output object', async () => {
    const node = createNode();
    const legacyChatOutputs: Outputs = {};
    let receivedArguments: Record<string, unknown> | undefined;

    applyStreamedFunctionCallOutputs(
      legacyChatOutputs,
      [[{ type: 'function', id: 'call_1', name: 'foo', arguments: '{"value":123}', lastParsedArguments: { value: 123 } }]],
      false,
      false,
    );

    const result = await node.process(
      {
        ['function-call' as PortId]: legacyChatOutputs['function-call' as PortId]!,
      },
      createContext((argumentsValue) => {
        receivedArguments = argumentsValue;
        return 'ok';
      }),
    );

    assert.deepEqual(receivedArguments, { value: 123 });
    assert.equal(result.output?.value, 'ok');
  });

  it('unwraps a single legacy Chat parallel function-calls output item', async () => {
    const node = createNode();
    const legacyChatOutputs: Outputs = {};
    let receivedArguments: Record<string, unknown> | undefined;

    applyStreamedFunctionCallOutputs(
      legacyChatOutputs,
      [[{ type: 'function', id: 'call_1', name: 'foo', arguments: '{"value":123}', lastParsedArguments: { value: 123 } }]],
      false,
      true,
    );

    const result = await node.process(
      {
        ['function-call' as PortId]: legacyChatOutputs['function-calls' as PortId]!,
      },
      createContext((argumentsValue) => {
        receivedArguments = argumentsValue;
        return 'ok';
      }),
    );

    assert.deepEqual(receivedArguments, { value: 123 });
    assert.equal(result.output?.value, 'ok');
  });

  it('unwraps a single function call from Chat v2 Function Calls output', async () => {
    const node = createNode();
    let receivedArguments: Record<string, unknown> | undefined;

    const result = await node.process(
      {
        ['function-call' as PortId]: {
          type: 'object[]',
          value: [
            {
              name: 'foo',
              arguments: {},
              id: 'call_1',
            },
          ],
        },
      },
      createContext((argumentsValue) => {
        receivedArguments = argumentsValue;
        return 'ok';
      }),
    );

    assert.deepEqual(receivedArguments, {});
    assert.equal(result.output?.value, 'ok');
  });

  it('keeps the message output compatible with old object-based wiring', () => {
    const node = createNode();
    const messageOutput = node.getOutputDefinitions().find((output) => output.id === 'message');

    assert.deepEqual(messageOutput?.dataType, ['chat-message', 'chat-message[]', 'object', 'object[]']);
  });

  it('surfaces a single already-delegated tool call record without running it again', async () => {
    const node = createNode();
    let externalCallCount = 0;

    const result = await node.process(
      {
        ['function-call' as PortId]: {
          type: 'object',
          value: delegatedToolCallRecord('foo', 'stored output'),
        },
      },
      createContext(() => {
        externalCallCount++;
        return 'rerun output';
      }),
    );

    assert.equal(externalCallCount, 0);
    assert.equal(result.output?.type, 'string');
    assert.equal(result.output?.value, 'stored output');
    assert.deepEqual(result.message?.value, delegatedToolCallRecord('foo', 'stored output').message);
  });

  it('surfaces multiple already-delegated tool call records as arrays without running them again', async () => {
    const node = createNode();
    let externalCallCount = 0;
    const fooRecord = delegatedToolCallRecord('foo', 'foo output', 'call_foo');
    const barRecord = delegatedToolCallRecord('bar', 'bar output', 'call_bar');

    const result = await node.process(
      {
        ['function-call' as PortId]: {
          type: 'object[]',
          value: [fooRecord, barRecord],
        },
      },
      createContext(() => {
        externalCallCount++;
        return 'rerun output';
      }),
    );

    assert.equal(externalCallCount, 0);
    assert.equal(result.output?.type, 'string[]');
    assert.deepEqual(result.output?.value, ['foo output', 'bar output']);
    assert.equal(result.message?.type, 'chat-message[]');
    assert.deepEqual(result.message?.value, [fooRecord.message, barRecord.message]);
  });

  it('parses JSON string arguments from legacy function call shapes', async () => {
    const node = createNode();
    let receivedArguments: Record<string, unknown> | undefined;

    await node.process(
      {
        ['function-call' as PortId]: {
          type: 'object',
          value: {
            name: 'foo',
            arguments: '{"value":123}',
            id: 'call_1',
          },
        },
      },
      createContext((argumentsValue) => {
        receivedArguments = argumentsValue;
        return 'ok';
      }),
    );

    assert.deepEqual(receivedArguments, { value: 123 });
  });

  it('fails clearly when multiple function calls are provided without splitting', async () => {
    const node = createNode();

    await assert.rejects(
      () =>
        node.process(
          {
            ['function-call' as PortId]: {
              type: 'object[]',
              value: [
                { name: 'foo', arguments: {}, id: 'call_1' },
                { name: 'bar', arguments: {}, id: 'call_2' },
              ],
            },
          },
          createContext(() => 'ok'),
        ),
      /expected a single tool call, but received 2/,
    );
  });
});
