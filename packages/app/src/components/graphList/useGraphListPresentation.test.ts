import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GraphId, NodeGraph } from '@valerypopoff/rivet2-core';
import { getFolderItemPresentation, getGraphListItemPath } from './useGraphListPresentation.js';
import type { NodeGraphFolderItem } from './graphFolders.js';

const graph = (id: string, name: string): NodeGraph => ({
  metadata: { id: id as GraphId, name },
  nodes: [],
  connections: [],
});

describe('graph list presentation helpers', () => {
  it('detects collapsed folders that contain the open graph', () => {
    const item: NodeGraphFolderItem = {
      type: 'folder',
      name: 'Folder',
      fullPath: 'Folder',
      children: [{ type: 'graph', name: 'Child', graph: graph('child', 'Folder/Child') }],
    };

    const presentation = getFolderItemPresentation({
      currentGraph: graph('child', 'Folder/Child'),
      dragOverFolderName: undefined,
      draggingItemFolder: undefined,
      fullPath: getGraphListItemPath(item),
      graphReachabilityByGraphId: {},
      isExpanded: false,
      item,
      mainGraphId: 'main' as GraphId,
      referencingSelectedGraphIds: new Set(),
      renamingItemFullPath: undefined,
      runningGraphs: [],
      showUnreachableBadges: true,
    });

    assert.equal(presentation.isCollapsedOpenGraphFolder, true);
    assert.equal(presentation.folderGraphCount, 1);
    assert.equal(presentation.graphIsRunning, false);
  });

  it('derives graph row status without reading React state', () => {
    const item: NodeGraphFolderItem = {
      type: 'graph',
      name: 'Target',
      graph: graph('target', 'Folder/Target'),
    };

    const presentation = getFolderItemPresentation({
      currentGraph: graph('target', 'Folder/Target'),
      dragOverFolderName: undefined,
      draggingItemFolder: undefined,
      fullPath: getGraphListItemPath(item),
      graphReachabilityByGraphId: { target: 'unreachable' } as Record<GraphId, 'unreachable'>,
      isExpanded: true,
      item,
      mainGraphId: 'target' as GraphId,
      referencingSelectedGraphIds: new Set(['target' as GraphId]),
      renamingItemFullPath: undefined,
      runningGraphs: ['target' as GraphId],
      showUnreachableBadges: true,
    });

    assert.equal(presentation.fullPath, 'Folder/Target');
    assert.equal(presentation.isSelected, true);
    assert.equal(presentation.isMainGraph, true);
    assert.equal(presentation.referencesSelectedGraph, true);
    assert.equal(presentation.graphIsRunning, true);
    assert.equal(presentation.shouldShowUnreachableBadge, true);
  });

  it('suppresses unreachable badges while renaming or when hidden by settings', () => {
    const item: NodeGraphFolderItem = {
      type: 'graph',
      name: 'Target',
      graph: graph('target', 'Folder/Target'),
    };
    const fullPath = getGraphListItemPath(item);
    const baseOptions = {
      currentGraph: graph('other', 'Other'),
      dragOverFolderName: undefined,
      draggingItemFolder: undefined,
      fullPath,
      graphReachabilityByGraphId: { target: 'unreachable' } as Record<GraphId, 'unreachable'>,
      isExpanded: true,
      item,
      mainGraphId: 'main' as GraphId,
      referencingSelectedGraphIds: new Set<GraphId>(),
      runningGraphs: [],
    };

    assert.equal(
      getFolderItemPresentation({
        ...baseOptions,
        renamingItemFullPath: fullPath,
        showUnreachableBadges: true,
      }).shouldShowUnreachableBadge,
      false,
    );
    assert.equal(
      getFolderItemPresentation({
        ...baseOptions,
        renamingItemFullPath: undefined,
        showUnreachableBadges: false,
      }).shouldShowUnreachableBadge,
      false,
    );
  });

  it('flags folders as active drop targets only when dragging from another folder', () => {
    const item: NodeGraphFolderItem = {
      type: 'folder',
      name: 'Target',
      fullPath: 'Target',
      children: [],
    };
    const baseOptions = {
      currentGraph: graph('other', 'Other'),
      dragOverFolderName: 'Target',
      fullPath: getGraphListItemPath(item),
      graphReachabilityByGraphId: {},
      isExpanded: true,
      item,
      mainGraphId: undefined,
      referencingSelectedGraphIds: new Set<GraphId>(),
      renamingItemFullPath: undefined,
      runningGraphs: [],
      showUnreachableBadges: true,
    };

    assert.equal(
      getFolderItemPresentation({
        ...baseOptions,
        draggingItemFolder: 'Source',
      }).isDraggingOver,
      true,
    );
    assert.equal(
      getFolderItemPresentation({
        ...baseOptions,
        draggingItemFolder: 'Target',
      }).isDraggingOver,
      false,
    );
  });
});
