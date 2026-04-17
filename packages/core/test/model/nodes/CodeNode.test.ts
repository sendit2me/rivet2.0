import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { CodeNodeImpl, type CodeNode, type NodeBodySpec } from '../../../src/index.js';

const createNode = (data: Partial<CodeNode['data']>) => {
  return new CodeNodeImpl({
    ...CodeNodeImpl.create(),
    data: {
      ...CodeNodeImpl.create().data,
      ...data,
    },
  });
};

describe('CodeNode', () => {
  it('returns a colorized body preview without per-line ellipsis truncation', () => {
    const node = createNode({
      code: [
        'const longLine = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";',
        'return { output1: { type: "string", value: longLine } };',
      ].join('\n'),
    });

    assert.deepStrictEqual(node.getBody(), {
      type: 'colorized',
      text: [
        'const longLine = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";',
        'return { output1: { type: "string", value: longLine } };',
      ].join('\n'),
      language: 'javascript',
      fontSize: 12,
      fontFamily: 'monospace',
    } satisfies NodeBodySpec);
  });

  it('still limits the preview to the first 15 lines', () => {
    const node = createNode({
      code: Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n'),
    });

    assert.deepStrictEqual(node.getBody(), {
      type: 'colorized',
      text: Array.from({ length: 15 }, (_, index) => `line ${index + 1}`).join('\n'),
      language: 'javascript',
      fontSize: 12,
      fontFamily: 'monospace',
    } satisfies NodeBodySpec);
  });
});
