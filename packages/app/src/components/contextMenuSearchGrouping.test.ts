import assert from 'node:assert/strict';
import test from 'node:test';
import { getContextMenuSearchPresentation } from './contextMenuSearchGrouping.js';

test('getContextMenuSearchPresentation keeps non-graph search results before graphs', () => {
  const presentation = getContextMenuSearchPresentation([
    { id: 'graph-b', label: 'Graph B', searchSection: 'graphs' },
    { id: 'add-node:text', label: 'Text' },
    { id: 'graph-a', label: 'Graph A', searchSection: 'graphs' },
    { id: 'add-node:code', label: 'Code' },
  ]);

  assert.deepEqual(
    [...presentation.primaryItems, ...presentation.graphItems].map((item) => item.id),
    ['add-node:text', 'add-node:code', 'graph-b', 'graph-a'],
  );
  assert.deepEqual(
    presentation.graphItems.map((item) => item.id),
    ['graph-b', 'graph-a'],
  );
});

test('getContextMenuSearchPresentation shows the graph section header whenever graph results exist', () => {
  assert.equal(
    getContextMenuSearchPresentation([
      { id: 'graph-a', label: 'Graph A', searchSection: 'graphs' },
      { id: 'graph-b', label: 'Graph B', searchSection: 'graphs' },
    ]).graphItems.length > 0,
    true,
  );

  assert.equal(
    getContextMenuSearchPresentation([
      { id: 'add-node:text', label: 'Text' },
      { id: 'add-node:code', label: 'Code' },
    ]).graphItems.length > 0,
    false,
  );
});
