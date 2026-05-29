import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countGraphsInFolder,
  createFoldersFromGraphs,
  getFolderNames,
  isInFolder,
  setAllGraphFolderExpansionStates,
} from './graphFolders';

describe('graphFolders', () => {
  it('creates stable nested folder trees including empty folders', () => {
    const items = createFoldersFromGraphs(
      [
        { metadata: { name: 'root/alpha' }, nodes: [], connections: [] },
        { metadata: { name: 'root/nested/beta' }, nodes: [], connections: [] },
      ],
      ['empty/folder'],
    );

    assert.equal(items[0]?.type, 'folder');
    assert.equal(items[0]?.name, 'empty');
    assert.equal(items[1]?.type, 'folder');
    assert.equal(items[1]?.name, 'root');
    assert.deepEqual(getFolderNames(items), ['empty/folder', 'empty', 'root/nested', 'root']);
  });

  it('sorts graph tree names case-insensitively', () => {
    const items = createFoldersFromGraphs(
      [
        { metadata: { name: 'root/zulu' }, nodes: [], connections: [] },
        { metadata: { name: 'root/Alpha' }, nodes: [], connections: [] },
        { metadata: { name: 'root/bravo' }, nodes: [], connections: [] },
        { metadata: { name: 'root/CharlieFolder/inside' }, nodes: [], connections: [] },
        { metadata: { name: 'root/betaFolder/inside' }, nodes: [], connections: [] },
        { metadata: { name: 'delta' }, nodes: [], connections: [] },
        { metadata: { name: 'Charlie' }, nodes: [], connections: [] },
      ],
      ['betaFolder', 'AlphaFolder'],
    );

    assert.deepEqual(
      items.map((item) => item.name),
      ['AlphaFolder', 'betaFolder', 'root', 'Charlie', 'delta'],
    );

    const rootFolder = items.find((item) => item.type === 'folder' && item.name === 'root');
    assert.equal(rootFolder?.type, 'folder');

    if (rootFolder?.type === 'folder') {
      assert.deepEqual(
        rootFolder.children.map((item) => item.name),
        ['betaFolder', 'CharlieFolder', 'Alpha', 'bravo', 'zulu'],
      );
    }
  });

  it('detects items that live inside a folder path', () => {
    assert.equal(isInFolder('root/nested', 'root/nested/beta'), true);
    assert.equal(isInFolder('root/nested', 'root/other/beta'), false);
  });

  it('counts graphs inside folders recursively', () => {
    const items = createFoldersFromGraphs(
      [
        { metadata: { name: 'root/alpha' }, nodes: [], connections: [] },
        { metadata: { name: 'root/nested/beta' }, nodes: [], connections: [] },
      ],
      ['empty/folder'],
    );

    const emptyFolder = items[0];
    const rootFolder = items[1];

    assert.equal(emptyFolder?.type, 'folder');
    assert.equal(rootFolder?.type, 'folder');

    if (emptyFolder?.type === 'folder') {
      assert.equal(countGraphsInFolder(emptyFolder), 0);
    }

    if (rootFolder?.type === 'folder') {
      assert.equal(countGraphsInFolder(rootFolder), 2);
    }
  });

  it('sets expansion state for every folder in the active project only when needed', () => {
    const previousState = {
      'project-a/root': true,
      'project-b/root': true,
    };

    const collapsedState = setAllGraphFolderExpansionStates({
      expandedFolders: previousState,
      folderPaths: ['root', 'root/nested'],
      isExpanded: false,
      projectId: 'project-a',
    });

    assert.deepEqual(collapsedState, {
      'project-a/root': false,
      'project-a/root/nested': false,
      'project-b/root': true,
    });
    assert.notEqual(collapsedState, previousState);

    const unchangedState = setAllGraphFolderExpansionStates({
      expandedFolders: collapsedState,
      folderPaths: ['root', 'root/nested'],
      isExpanded: false,
      projectId: 'project-a',
    });

    assert.equal(unchangedState, collapsedState);
  });
});
