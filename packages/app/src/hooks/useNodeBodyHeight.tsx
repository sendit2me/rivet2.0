import { type NodeId } from '@valerypopoff/rivet2-core';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { nodesState } from '../state/graph';

const GARBAGE_COLLECTION_INTERVAL = 100;

export interface HeightCache {
  get: (nodeId: NodeId) => number | undefined;

  has: (nodeId: NodeId) => boolean;

  set: (nodeId: NodeId, height: number | undefined) => void;
}

export type NodeBodyHeightState = {
  ready: boolean;
  preserveCachedHeight: boolean;
};

export type PendingNodeBodyHeightState = {
  hasBody: boolean;
  hasResolvedBody: boolean;
  pending: boolean;
};

export const shouldPreserveCachedNodeBodyHeight = (state: PendingNodeBodyHeightState): boolean => {
  if (!state.pending) {
    return false;
  }

  return !state.hasResolvedBody || state.hasBody;
};

export const shouldCacheNodeBodyHeight = (height: number | undefined): height is number => {
  return height != null && Number.isFinite(height) && height > 0;
};

export const resolveNodeBodyHeight = (
  heightCache: HeightCache,
  nodeId: NodeId,
  state: NodeBodyHeightState,
): string | undefined => {
  if (state.ready || !state.preserveCachedHeight || !heightCache.has(nodeId)) {
    return undefined;
  }

  const height = heightCache.get(nodeId);
  return shouldCacheNodeBodyHeight(height) ? `${height}px` : undefined;
};

/**
 * A cache of node heights. This is used when a node is unmounted and moved to the dragging list, since the node's
 * body needs to be re-rendered in order to get its height. This cache allows us to avoid flickering when the node
 * is first rendered in the dragging list.
 */
export const useNodeHeightCache = (): HeightCache => {
  const nodes = useAtomValue(nodesState);

  const ref = useRef(new Map<NodeId, number>());
  const garbageCollectionCount = useRef(0);

  const set = useCallback((nodeId: NodeId, height: number | undefined) => {
    if (!shouldCacheNodeBodyHeight(height)) {
      ref.current.delete(nodeId);
    } else {
      ref.current.set(nodeId, height);
    }
  }, []);

  const get = useCallback((nodeId: NodeId) => {
    return ref.current.get(nodeId);
  }, []);

  const has = useCallback((nodeId: NodeId) => {
    return ref.current.has(nodeId);
  }, []);

  /**
   * This hook removes nodes from the cache that have been deleted. To improve performance, we only clean up
   * the cache for every X nodes that are deleted (cache is just numbers).
   */
  useEffect(() => {
    if (garbageCollectionCount.current++ % GARBAGE_COLLECTION_INTERVAL !== 0) {
      return;
    }

    const currentNodeIds = new Set(nodes.map((node) => node.id));
    for (const nodeId of ref.current.keys()) {
      if (!currentNodeIds.has(nodeId)) {
        ref.current.delete(nodeId);
      }
    }
  }, [nodes]);

  return useMemo(() => {
    return { set, get, has } satisfies HeightCache;
  }, [set, get, has]);
};

/**
 * This hook persists the last known height of a node's body to the height cache, and can later use that last known
 * height temporarily while the node is waiting for the body to be available.
 */
export const useNodeBodyHeight = (heightCache: HeightCache, nodeId: NodeId, state: NodeBodyHeightState) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.ready) {
      heightCache.set(nodeId, ref.current?.getBoundingClientRect().height);
    } else if (!state.preserveCachedHeight) {
      heightCache.set(nodeId, undefined);
    }
  }, [heightCache, nodeId, state.preserveCachedHeight, state.ready]);

  return { ref, height: resolveNodeBodyHeight(heightCache, nodeId, state) };
};
