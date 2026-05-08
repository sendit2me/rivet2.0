import assert from 'node:assert/strict';
import test from 'node:test';
import type { NodeId } from '@valerypopoff/rivet2-core';
import { type HeightCache, resolveNodeBodyHeight } from './useNodeBodyHeight.js';

function createHeightCache(initialHeight?: number): HeightCache {
  const nodeId = 'node-1' as NodeId;
  const heights = new Map<NodeId, number>();

  if (initialHeight !== undefined) {
    heights.set(nodeId, initialHeight);
  }

  return {
    get: (id) => heights.get(id),
    has: (id) => heights.has(id),
    set: (id, height) => {
      if (height == null) {
        heights.delete(id);
      } else {
        heights.set(id, height);
      }
    },
  };
}

test('node body height is preserved only while a body is pending', () => {
  const nodeId = 'node-1' as NodeId;
  const heightCache = createHeightCache(42);

  assert.equal(resolveNodeBodyHeight(heightCache, nodeId, { ready: false, preserveCachedHeight: true }), '42px');
  assert.equal(resolveNodeBodyHeight(heightCache, nodeId, { ready: false, preserveCachedHeight: false }), undefined);
  assert.equal(resolveNodeBodyHeight(heightCache, nodeId, { ready: true, preserveCachedHeight: true }), undefined);
});

test('cleared node body heights are not formatted as pending placeholders', () => {
  const nodeId = 'node-1' as NodeId;
  const heightCache = createHeightCache(42);

  heightCache.set(nodeId, undefined);

  assert.equal(resolveNodeBodyHeight(heightCache, nodeId, { ready: false, preserveCachedHeight: true }), undefined);

  const staleHeightCache: HeightCache = {
    get: () => undefined,
    has: () => true,
    set: () => {},
  };
  assert.equal(
    resolveNodeBodyHeight(staleHeightCache, nodeId, { ready: false, preserveCachedHeight: true }),
    undefined,
  );
});
