import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findStronglyConnectedComponents } from '../../src/model/CycleDetector';

describe('CycleDetector', () => {
  it('finds strongly connected components in a mixed graph', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] as any[];
    const adjacency = new Map<any, any[]>([
      [nodes[0], [nodes[1]]],
      [nodes[1], [nodes[0], nodes[2]]],
      [nodes[2], []],
      [nodes[3], [nodes[3]]],
    ]);

    const components = findStronglyConnectedComponents(nodes as any, (node) => adjacency.get(node) ?? []).map((component) =>
      component.map((node) => node.id).sort(),
    );

    assert.deepEqual(
      components.sort((left, right) => left.join(',').localeCompare(right.join(','))),
      [['a', 'b'], ['c'], ['d']],
    );
  });
});
