import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  IsomorphicCodeRunner,
  JSFilterNodeImpl,
  NotAllowedCodeRunner,
  type InternalProcessContext,
  type JSFilterNode,
  type NodeBodySpec,
  type PortId,
} from '../../../src/index.js';

const createNode = (data: Partial<JSFilterNode['data']>) => {
  return new JSFilterNodeImpl({
    ...JSFilterNodeImpl.create(),
    data: {
      ...JSFilterNodeImpl.create().data,
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

describe('JSFilterNode', () => {
  it('can create node', () => {
    const node = JSFilterNodeImpl.create();
    assert.strictEqual(node.type, 'jsFilter');
    assert.strictEqual(node.title, 'JS Filter');
  });

  it('seeds the default callback body in the editor config', () => {
    const node = JSFilterNodeImpl.create();
    const editors = new JSFilterNodeImpl(node).getEditors();

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
      callbackBody: ['const allowed = index > 0;', 'return allowed && item != null;'].join('\n'),
    });

    assert.deepStrictEqual(node.getBody(), {
      type: 'colorized',
      text: ['(item, index, array) => {', '  const allowed = index > 0;', '  return allowed && item != null;', '}'].join(
        '\n',
      ),
      language: 'javascript',
      fontSize: 12,
      fontFamily: 'monospace',
    } satisfies NodeBodySpec);
  });

  it('filters numbers with plain JS values', async () => {
    const node = createNode({ callbackBody: 'return item > 2;' });
    const result = await node.process(
      {
        ['array' as PortId]: { type: 'number[]', value: [1, 2, 3, 4] },
      },
      createContext(),
    );

    assert.deepStrictEqual(result, {
      filtered: {
        type: 'any[]',
        value: [3, 4],
      },
    });
  });

  it('receives index and array callback parameters', async () => {
    const node = createNode({
      callbackBody: 'return index === 0 || item === array[array.length - 1];',
    });

    const result = await node.process(
      {
        ['array' as PortId]: { type: 'string[]', value: ['a', 'b', 'c'] },
      },
      createContext(),
    );

    assert.deepStrictEqual(result.filtered?.value, ['a', 'c']);
  });

  it('uses JS truthiness rather than strict booleans', async () => {
    const node = createNode({ callbackBody: 'return item;' });

    const result = await node.process(
      {
        ['array' as PortId]: { type: 'any[]', value: [0, 1, '', 'hello', null] },
      },
      createContext(),
    );

    assert.deepStrictEqual(result.filtered?.value, [1, 'hello']);
  });

  it('throws on missing or non-array input', async () => {
    const node = createNode({ callbackBody: 'return true;' });

    await assert.rejects(
      () =>
        node.process(
          {
            ['array' as PortId]: { type: 'string', value: 'not-an-array' },
          },
          createContext(),
        ),
      /JS Filter input "array" must be an array\./,
    );
  });

  it('rejects promise-returning callbacks', async () => {
    const node = createNode({ callbackBody: 'return Promise.resolve(true);' });

    await assert.rejects(
      () =>
        node.process(
          {
            ['array' as PortId]: { type: 'number[]', value: [1, 2, 3] },
          },
          createContext(),
        ),
      /JS Filter callbacks must be synchronous\./,
    );
  });

  it('respects disabled dynamic code execution', async () => {
    const node = createNode({ callbackBody: 'return true;' });

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
