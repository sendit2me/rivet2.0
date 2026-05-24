import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countGraphsInFolder, createFoldersFromGraphs, getFolderNames, isInFolder } from './graphFolders';

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
});
