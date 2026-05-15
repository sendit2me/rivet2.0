import assert from 'node:assert/strict';
import test from 'node:test';
import { CommentNodeImpl } from '../../../src/index.js';

test('CommentNodeImpl.create uses a 50% gray default background without changing transparency', () => {
  const node = CommentNodeImpl.create();

  assert.equal(node.data.backgroundColor, 'rgba(128,128,128,0.05)');
});
