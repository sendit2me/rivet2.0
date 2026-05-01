import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { ThreadMessageNodeImpl } from '../../../../src/plugins/openai/nodes/ThreadMessageNode.js';

describe('ThreadMessageNodeImpl', () => {
  it('discovers later valid interpolation inputs even when an earlier opener is broken', () => {
    const data = {
      ...ThreadMessageNodeImpl.create().data,
      text: ['{{foo}}', '{{bar', '{{somevar}}'].join('\n'),
    };

    assert.deepStrictEqual(
      ThreadMessageNodeImpl.getInputDefinitions(data, [], {} as any, {} as any).map((definition) => definition.id),
      ['foo', 'somevar'],
    );
  });
});
