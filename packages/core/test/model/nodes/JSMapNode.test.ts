import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  IsomorphicCodeRunner,
  JSMapNodeImpl,
  NotAllowedCodeRunner,
  type InternalProcessContext,
  type JSMapNode,
  type NodeBodySpec,
  type PortId,
} from '../../../src/index.js';

const createNode = (data: Partial<JSMapNode['data']>) => {
  return new JSMapNodeImpl({
    ...JSMapNodeImpl.create(),
    data: {
      ...JSMapNodeImpl.create().data,
      ...data,
    },
  });
};

const createContext = (codeRunner = new IsomorphicCodeRunner()) =>
  ({
    codeRunner,
    graphInputNodeValues: {},
    contextValues: {},
  }) as InternalProcessContext;

describe('JSMapNode', () => {
  it('can create node', () => {
    const node = JSMapNodeImpl.create();
    assert.strictEqual(node.type, 'jsMap');
    assert.strictEqual(node.title, 'JS Map');
  });

  it('seeds the default callback body in the editor config', () => {
    const node = JSMapNodeImpl.create();
    const editors = new JSMapNodeImpl(node).getEditors();

    assert.deepStrictEqual(editors, [
      {
        type: 'code',
        label: 'Callback Body',
        helperMessage: 'Body of: (item, index, array) => { ... }',
        dataKey: 'callbackBody',
        language: 'javascript',
        enableFolding: true,
      },
    ]);
  });

  it('renders a wrapped callback preview body', () => {
    const node = createNode({
      callbackBody: ['const next = item * 2;', 'return next;'].join('\n'),
    });

    assert.deepStrictEqual(node.getBody(), {
      type: 'colorized',
      text: ['(item, index, array) => {', '  const next = item * 2;', '  return next;', '}'].join('\n'),
      language: 'javascript',
      fontSize: 12,
      fontFamily: 'monospace',
    } satisfies NodeBodySpec);
  });

  it('maps numbers with plain JS values', async () => {
    const node = createNode({ callbackBody: 'return item * 2;' });
    const result = await node.process(
      {
        ['array' as PortId]: { type: 'number[]', value: [1, 2, 3] },
      },
      createContext(),
    );

    assert.deepStrictEqual(result, {
      mapped: {
        type: 'any[]',
        value: [2, 4, 6],
      },
    });
  });

  it('receives index and array callback parameters', async () => {
    const node = createNode({
      callbackBody: 'return `${index}:${array.length}:${item}`;',
    });

    const result = await node.process(
      {
        ['array' as PortId]: { type: 'string[]', value: ['a', 'b'] },
      },
      createContext(),
    );

    assert.deepStrictEqual(result.mapped?.value, ['0:2:a', '1:2:b']);
  });

  it('supports mapping to objects', async () => {
    const node = createNode({
      callbackBody: 'return { item, index };',
    });

    const result = await node.process(
      {
        ['array' as PortId]: { type: 'string[]', value: ['x', 'y'] },
      },
      createContext(),
    );

    assert.deepStrictEqual(result.mapped?.value, [
      { item: 'x', index: 0 },
      { item: 'y', index: 1 },
    ]);
  });

  it('throws on missing or non-array input', async () => {
    const node = createNode({ callbackBody: 'return item;' });

    await assert.rejects(
      () =>
        node.process(
          {
            ['array' as PortId]: { type: 'string', value: 'not-an-array' },
          },
          createContext(),
        ),
      /JS Map input "array" must be an array\./,
    );
  });

  it('rejects promise-returning callbacks', async () => {
    const node = createNode({ callbackBody: 'return Promise.resolve(item);' });

    await assert.rejects(
      () =>
        node.process(
          {
            ['array' as PortId]: { type: 'number[]', value: [1, 2, 3] },
          },
          createContext(),
        ),
      /JS Map callbacks must be synchronous\./,
    );
  });

  it('respects disabled dynamic code execution', async () => {
    const node = createNode({ callbackBody: 'return item;' });

    await assert.rejects(
      () =>
        node.process(
          {
            ['array' as PortId]: { type: 'number[]', value: [1] },
          },
          createContext(new NotAllowedCodeRunner()),
        ),
      /Dynamic code execution is disabled\./,
    );
  });
});
