import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { RandomNumberNodeImpl, type PortId, type RandomNumberNode } from '../../../src/index.js';

const createNode = (data: Partial<RandomNumberNode['data']>) => {
  const baseNode = RandomNumberNodeImpl.create();

  return new RandomNumberNodeImpl({
    ...baseNode,
    data: {
      ...baseNode.data,
      ...data,
    },
  });
};

const withRandom = async <T>(randomValue: number, callback: () => Promise<T> | T): Promise<T> => {
  const originalRandom = Math.random;

  Math.random = () => randomValue;

  try {
    return await callback();
  } finally {
    Math.random = originalRandom;
  }
};

describe('RandomNumberNode', () => {
  it('creates the existing randomNumber node type with the updated display title', () => {
    const node = RandomNumberNodeImpl.create();

    assert.strictEqual(node.type, 'randomNumber');
    assert.strictEqual(node.title, 'Random number');
    assert.deepStrictEqual(node.data, {
      min: 0,
      max: 1,
      integers: false,
      maxInclusive: false,
    });
  });

  it('uses a segmented Float/Integer editor backed by the existing integers field', () => {
    const editors = new RandomNumberNodeImpl(RandomNumberNodeImpl.create()).getEditors();

    assert.deepStrictEqual(editors, [
      {
        type: 'segmented',
        label: '',
        ariaLabel: 'Random number type',
        dataKey: 'integers',
        defaultValue: false,
        options: [
          { value: false, label: 'Float' },
          { value: true, label: 'Integer' },
        ],
      },
      { type: 'number', label: 'Min', dataKey: 'min', useInputToggleDataKey: 'useMinInput' },
      { type: 'number', label: 'Max', dataKey: 'max', useInputToggleDataKey: 'useMaxInput' },
      { type: 'toggle', label: 'Max Inclusive', dataKey: 'maxInclusive' },
    ]);
  });

  it('keeps legacy integer max-exclusive behavior by default', async () => {
    const node = createNode({
      min: 3,
      max: 7,
      integers: true,
      maxInclusive: false,
    });

    const minResult = await withRandom(0, () => node.process({}));
    const maxResult = await withRandom(0.999999, () => node.process({}));

    assert.strictEqual(minResult.value?.value, 3);
    assert.strictEqual(maxResult.value?.value, 6);
  });

  it('keeps legacy integer max-inclusive behavior when enabled', async () => {
    const node = createNode({
      min: 3,
      max: 7,
      integers: true,
      maxInclusive: true,
    });

    const minResult = await withRandom(0, () => node.process({}));
    const maxResult = await withRandom(0.999999, () => node.process({}));

    assert.strictEqual(minResult.value?.value, 3);
    assert.strictEqual(maxResult.value?.value, 7);
  });

  it('keeps legacy float range behavior', async () => {
    const node = createNode({
      min: 3,
      max: 7,
      integers: false,
    });

    const minResult = await withRandom(0, () => node.process({}));
    const midResult = await withRandom(0.5, () => node.process({}));

    assert.strictEqual(minResult.value?.value, 3);
    assert.strictEqual(midResult.value?.value, 5);
  });

  it('keeps legacy Min and Max input ports working', async () => {
    const node = createNode({
      integers: true,
      useMinInput: true,
      useMaxInput: true,
    });

    assert.deepStrictEqual(
      node.getInputDefinitions().map((definition) => [definition.id, definition.title, definition.dataType]),
      [
        ['min', 'Min', 'number'],
        ['max', 'Max', 'number'],
      ],
    );

    const result = await node.process({
      ['min' as PortId]: { type: 'number', value: 5 },
      ['max' as PortId]: { type: 'number', value: 5 },
    });

    assert.deepStrictEqual(result.value?.value, 5);
  });

  it('processes old saved RNG-titled nodes with the original data shape', async () => {
    const savedLegacyNode: RandomNumberNode = {
      ...RandomNumberNodeImpl.create(),
      title: 'RNG',
      data: {
        min: 10,
        max: 20,
        integers: true,
        maxInclusive: false,
      },
    };
    const node = new RandomNumberNodeImpl(savedLegacyNode);

    const result = await withRandom(0, () => node.process({}));

    assert.deepStrictEqual(node.getInputDefinitions(), []);
    assert.deepStrictEqual(result.value?.value, 10);
  });
});
