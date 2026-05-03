import assert from 'node:assert/strict';
import test from 'node:test';
import { type GraphId, type NodeGraph } from '@rivet2/rivet-core';
import {
  buildNewFolderPath,
  buildUniqueNewFolderPath,
  buildUntitledGraph,
  deleteFolderGraphs,
  findRunnableGraphId,
  renameFolderItemInGraphs,
} from './graphListActions';

function makeGraph(id: string, name: string): NodeGraph {
  return {
    metadata: { id: id as GraphId, name, description: '' },
    nodes: [],
    connections: [],
  };
}

test('buildUntitledGraph increments names within a folder', () => {
  const graphs = [makeGraph('g-1', 'folder/Untitled Graph')];
  const graph = buildUntitledGraph(graphs, 'folder');

  assert.equal(graph.metadata?.name, 'folder/Untitled Graph 2');
});

test('buildNewFolderPath creates nested folder names', () => {
  assert.equal(buildNewFolderPath('parent'), 'parent/New Folder');
  assert.equal(buildNewFolderPath(), 'New Folder');
});

test('buildUniqueNewFolderPath increments folder names within the same parent', () => {
  assert.equal(buildUniqueNewFolderPath(undefined, ['New Folder'], []), 'New Folder 2');
  assert.equal(buildUniqueNewFolderPath('parent', ['parent/New Folder'], []), 'parent/New Folder 2');
  assert.equal(buildUniqueNewFolderPath('parent', ['parent/New Folder', 'parent/New Folder 2'], []), 'parent/New Folder 3');
});

test('deleteFolderGraphs removes graphs within the folder subtree', () => {
  const graphs = [makeGraph('g-1', 'folder/One'), makeGraph('g-2', 'other/Two')];
  const remaining = deleteFolderGraphs(graphs, 'folder');

  assert.deepEqual(remaining.map((graph) => graph.metadata?.id), ['g-2']);
});

test('deleteFolderGraphs also removes nested folder descendants', () => {
  const graphs = [makeGraph('g-1', 'folder/nested/One'), makeGraph('g-2', 'folderTwo/Two')];
  const remaining = deleteFolderGraphs(graphs, 'folder');

  assert.deepEqual(remaining.map((graph) => graph.metadata?.id), ['g-2']);
});

test('findRunnableGraphId resolves a graph by full path', () => {
  const graphs = [makeGraph('g-1', 'folder/One')];
  assert.equal(findRunnableGraphId(graphs, 'folder/One'), 'g-1');
});

test('renameFolderItemInGraphs renames matching graph paths and folder names', () => {
  const result = renameFolderItemInGraphs({
    fullPath: 'folder',
    newFullPath: 'renamed',
    savedGraphs: [makeGraph('g-1', 'folder/One')],
    currentGraph: makeGraph('g-1', 'folder/One'),
    folderNames: ['folder'],
  });

  assert.ok(!('error' in result));
  if ('error' in result) {
    return;
  }

  assert.equal(result.savedGraphs[0]?.metadata?.name, 'renamed/One');
  assert.equal(result.currentGraph.metadata?.name, 'renamed/One');
  assert.deepEqual(result.folderNames, ['renamed']);
});

test('renameFolderItemInGraphs leaves unrelated current graph names unchanged', () => {
  const result = renameFolderItemInGraphs({
    fullPath: 'folder',
    newFullPath: 'renamed',
    savedGraphs: [makeGraph('g-1', 'folder/One')],
    currentGraph: makeGraph('g-2', 'other/folderish/Two'),
    folderNames: ['folder'],
  });

  assert.ok(!('error' in result));
  if ('error' in result) {
    return;
  }

  assert.equal(result.savedGraphs[0]?.metadata?.name, 'renamed/One');
  assert.equal(result.currentGraph.metadata?.name, 'other/folderish/Two');
  assert.deepEqual(result.folderNames, ['renamed']);
});
