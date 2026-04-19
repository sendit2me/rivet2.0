import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { TextNodeImpl, type TextNode, type NodeBodySpec } from '../../../src/index.js';

const createNode = (data: Partial<TextNode['data']>) => {
  return new TextNodeImpl({
    ...TextNodeImpl.create(),
    data: {
      ...TextNodeImpl.create().data,
      ...data,
    },
  });
};

describe('TextNode', () => {
  it('truncates long single-line previews so large blobs do not render in full', () => {
    const node = createNode({
      text: `prefix-${'a'.repeat(5000)}`,
    });

    assert.deepStrictEqual(node.getBody(), {
      type: 'colorized',
      language: 'prompt-interpolation-markdown',
      theme: 'prompt-interpolation',
      text: `prefix-${'a'.repeat(233)}...`,
    } satisfies NodeBodySpec);
  });

  it('still limits the preview to the first 15 lines', () => {
    const node = createNode({
      text: Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n'),
    });

    assert.deepStrictEqual(node.getBody(), {
      type: 'colorized',
      language: 'prompt-interpolation-markdown',
      theme: 'prompt-interpolation',
      text: `${Array.from({ length: 15 }, (_, index) => `line ${index + 1}`).join('\n')}\n...`,
    } satisfies NodeBodySpec);
  });
});
