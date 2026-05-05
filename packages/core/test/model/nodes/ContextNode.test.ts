import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  ContextNodeImpl,
  type ContextNode,
  type DataValue,
  type InternalProcessContext,
} from '../../../src/index.js';

const createNode = (data: Partial<ContextNode['data']>) => {
  const baseNode = ContextNodeImpl.create();

  return new ContextNodeImpl({
    ...baseNode,
    data: {
      ...baseNode.data,
      ...data,
    },
  });
};

const createContext = (contextValues: Record<string, DataValue> = {}) =>
  ({
    contextValues,
  }) as InternalProcessContext;

describe('ContextNode', () => {
  it('coerces runtime context values to the configured data type', async () => {
    const node = createNode({
      id: 'count',
      dataType: 'number',
    });

    const result = await node.process({}, createContext({ count: { type: 'string', value: '42' } }));

    assert.deepEqual(result.data, { type: 'number', value: 42 });
  });

  it('coerces the editor default value when the runtime context value is absent', async () => {
    const node = createNode({
      id: 'enabled',
      dataType: 'boolean',
      defaultValue: 'true',
    });

    const result = await node.process({}, createContext());

    assert.deepEqual(result.data, { type: 'boolean', value: true });
  });

  it('coerces the default input value when the default value input is enabled', async () => {
    const node = createNode({
      id: 'count',
      dataType: 'number',
      defaultValue: 10,
      useDefaultValueInput: true,
    });

    const result = await node.process(
      {
        default: { type: 'string', value: '7' },
      },
      createContext(),
    );

    assert.deepEqual(result.data, { type: 'number', value: 7 });
  });

  it('falls back to the editor default when the default input is enabled but unwired', async () => {
    const node = createNode({
      id: 'label',
      dataType: 'string',
      defaultValue: 'from editor',
      useDefaultValueInput: true,
    });

    const result = await node.process({}, createContext());

    assert.deepEqual(result.data, { type: 'string', value: 'from editor' });
  });

  it('uses the configured data type default when no context or default value is provided', async () => {
    const node = createNode({
      id: 'items',
      dataType: 'string[]',
    });

    const result = await node.process({}, createContext());

    assert.deepEqual(result.data, { type: 'string[]', value: [] });
  });
});
