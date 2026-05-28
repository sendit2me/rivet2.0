import assert from 'node:assert/strict';
import test from 'node:test';
import { getContextMenuDataFromTarget } from './useContextMenu.js';

type FakeContextMenuNode = {
  dataset?: {
    contextmenutype?: string;
  };
  parentElement?: FakeContextMenuNode | null;
};

const asEventTarget = (node: FakeContextMenuNode) => node as unknown as EventTarget;

test('context menu target lookup resolves a context menu ancestor', () => {
  const graphItem: FakeContextMenuNode = {
    dataset: { contextmenutype: 'graph-item' },
  };
  const icon: FakeContextMenuNode = {
    dataset: {},
    parentElement: graphItem,
  };

  const data = getContextMenuDataFromTarget(asEventTarget(icon));

  assert.equal(data?.type, 'graph-item');
  assert.equal(data?.element, graphItem);
});

test('context menu target lookup tolerates text-node-like targets without a dataset', () => {
  const folderItem: FakeContextMenuNode = {
    dataset: { contextmenutype: 'graph-folder' },
  };
  const textTarget: FakeContextMenuNode = {
    parentElement: folderItem,
  };

  const data = getContextMenuDataFromTarget(asEventTarget(textTarget));

  assert.equal(data?.type, 'graph-folder');
  assert.equal(data?.element, folderItem);
});

test('context menu target lookup returns null without a menu ancestor', () => {
  const ordinaryElement: FakeContextMenuNode = {
    dataset: {},
  };

  assert.equal(getContextMenuDataFromTarget(asEventTarget(ordinaryElement)), null);
  assert.equal(getContextMenuDataFromTarget(null), null);
});

test('context menu target lookup stops on cyclic parent chains', () => {
  const ordinaryElement: FakeContextMenuNode = {
    dataset: {},
  };
  ordinaryElement.parentElement = ordinaryElement;

  assert.equal(getContextMenuDataFromTarget(asEventTarget(ordinaryElement)), null);
});
