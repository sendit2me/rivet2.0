import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'jotai/vanilla';
import { graphState } from '../atoms/graph';
import { connectionsForNodeState, nodesByIdState } from './graphSelectors';

describe('graphSelectors', () => {
  it('indexes nodes and connections from the root graph atom', () => {
    const store = createStore();

    store.set(graphState, {
      metadata: { id: 'graph-1', name: 'Test' },
      nodes: [
        { id: 'a', type: 'input', title: 'A', visualData: { x: 0, y: 0 } },
        { id: 'b', type: 'output', title: 'B', visualData: { x: 10, y: 10 } },
      ],
      connections: [
        { inputNodeId: 'b', inputId: 'input', outputNodeId: 'a', outputId: 'output' },
      ],
    } as any);

    assert.equal(store.get(nodesByIdState)['a' as any]?.title, 'A');
    assert.equal(store.get(connectionsForNodeState)['a' as any]?.length, 1);
    assert.equal(store.get(connectionsForNodeState)['b' as any]?.length, 1);
  });
});
