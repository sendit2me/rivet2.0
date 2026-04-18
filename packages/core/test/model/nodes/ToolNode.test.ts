import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { GptFunctionNodeImpl, type GptFunctionNode } from '../../../src/index.js';

const createNode = (data: Partial<GptFunctionNode['data']>) => {
  return new GptFunctionNodeImpl({
    ...GptFunctionNodeImpl.create(),
    data: {
      ...GptFunctionNodeImpl.create().data,
      ...data,
    },
  });
};

describe('GptFunctionNodeImpl', () => {
  it('discovers later valid schema inputs even when an earlier interpolation opener is broken', () => {
    const node = createNode({
      schema: ['{"type":"object","properties":{"foo":{"default":"{{foo}}"},', '"bar":{"default":"{{bar"},', '"baz":{"default":"{{somevar}}"}}}'].join(
        '\n',
      ),
    });

    assert.deepStrictEqual(
      node.getInputDefinitions([], {}, {} as any, {}).map((definition) => definition.id),
      ['input-foo', 'input-somevar'],
    );
  });
});
