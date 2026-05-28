import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { GraphOutputNodeImpl } from '../../../src/index.js';

test('Graph Output ID editor debounces commits because caller rewrites are expensive', () => {
  const node = GraphOutputNodeImpl.create();
  const idEditor = new GraphOutputNodeImpl(node).getEditors().find((editor) => editor.type === 'string');

  assert.equal(idEditor?.type, 'string');
  assert.equal(idEditor?.dataKey, 'id');
  assert.equal(idEditor?.commitDebounceMs, 300);
});
