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

test('getContextMenuSearchPresentation prioritizes graph input and output node search results', () => {
  const presentation = getContextMenuSearchPresentation([
    { id: 'add-node:text', label: 'Text' },
    { id: 'add-node:graphOutput', label: 'Graph Output' },
    { id: 'graph-a', label: 'Graph A', searchSection: 'graphs' },
    { id: 'add-node:graphInput', label: 'Graph Input' },
    { id: 'add-node:code', label: 'Code' },
  ]);

  assert.deepEqual(
    [...presentation.primaryItems, ...presentation.graphItems].map((item) => item.id),
    ['add-node:graphInput', 'add-node:graphOutput', 'add-node:text', 'add-node:code', 'graph-a'],
  );
  assert.equal(presentation.primaryItems[2]?.separatorBefore, true);
});

test('getContextMenuSearchPresentation skips the priority divider when only graph input and output match', () => {
  const presentation = getContextMenuSearchPresentation([
    { id: 'add-node:graphOutput', label: 'Graph Output' },
    { id: 'add-node:graphInput', label: 'Graph Input' },
  ]);

  assert.deepEqual(
    presentation.primaryItems.map((item) => item.id),
    ['add-node:graphInput', 'add-node:graphOutput'],
  );
  assert.equal(presentation.primaryItems.some((item) => item.separatorBefore), false);
});

test('getContextMenuSearchPresentation adds the priority divider when one graph boundary node matches', () => {
  const presentation = getContextMenuSearchPresentation([
    { id: 'add-node:text', label: 'Text' },
    { id: 'add-node:graphInput', label: 'Graph Input' },
  ]);

  assert.deepEqual(
    presentation.primaryItems.map((item) => item.id),
    ['add-node:graphInput', 'add-node:text'],
  );
  assert.equal(presentation.primaryItems[1]?.separatorBefore, true);
});
