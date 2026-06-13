import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChartNode, GraphId, NodeGraph, NodeId, Project, ProjectId } from '@valerypopoff/rivet2-core';
import {
  getFolderItemPresentation,
  getGraphListItemPath,
  mergeGraphListCurrentGraphIntoProject,
} from './useGraphListPresentation.js';
import { getGraphIdsReferencingGraph, getGraphReachabilityReport } from '../../utils/graphReachability.js';
import type { NodeGraphFolderItem } from './graphFolders.js';

const graph = (id: string, name: string): NodeGraph => ({
  metadata: { id: id as GraphId, name },
  nodes: [],
  connections: [],
});

const node = (id: string, type: string, data: Record<string, unknown> = {}): ChartNode => ({
  id: id as NodeId,
  type,
  title: type,
  visualData: { x: 0, y: 0 },
  data,
});

const project = (graphs: NodeGraph[], mainGraphId: string): Project =>
  ({
    metadata: {
      id: 'project-id' as ProjectId,
      title: 'Project',
      description: '',
      mainGraphId: mainGraphId as GraphId,
    },
    graphs: Object.fromEntries(graphs.map((entry) => [entry.metadata!.id!, entry])),
    plugins: [],
  }) as Project;

function sortGraphIds(graphIds: Set<GraphId>): string[] {
  return [...graphIds].sort();
}

describe('graph list presentation helpers', () => {
  it('uses the live current graph when computing graph reachability', () => {
    const savedMain = graph('main', 'Main');
    const target = graph('target', 'Target');
    const currentMain = {
      ...savedMain,
      nodes: [node('subgraph', 'subGraph', { graphId: 'target' as GraphId })],
    };
    const staleReport = getGraphReachabilityReport(project([savedMain, target], 'main'));
    const liveReport = getGraphReachabilityReport(
      mergeGraphListCurrentGraphIntoProject(project([savedMain, target], 'main'), currentMain),
    );

    assert.deepEqual(sortGraphIds(staleReport.unreachable), ['target']);
    assert.deepEqual(sortGraphIds(liveReport.unreachable), []);
  });

  it('uses the live current graph when computing graph reference indicators', () => {
    const savedMain = graph('main', 'Main');
    const target = graph('target', 'Target');
    const currentMain = {
      ...savedMain,
      nodes: [node('subgraph', 'subGraph', { graphId: 'target' as GraphId })],
    };
    const baseProject = project([savedMain, target], 'main');
    const liveProject = mergeGraphListCurrentGraphIntoProject(baseProject, currentMain);

    assert.deepEqual(sortGraphIds(getGraphIdsReferencingGraph(baseProject, 'target' as GraphId)), []);
    assert.deepEqual(sortGraphIds(getGraphIdsReferencingGraph(liveProject, 'target' as GraphId)), ['main']);
  });

  it('does not add an unsaved current graph to graph-list reachability analysis', () => {
    const savedMain = graph('main', 'Main');
    const draftGraph = graph('draft', 'Draft');
    const baseProject = project([savedMain], 'main');

    assert.equal(mergeGraphListCurrentGraphIntoProject(baseProject, draftGraph), baseProject);
  });

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
    assert.equal(presentation.containsReferencingSelectedGraph, false);
  });

  it('detects collapsed folders that contain graphs referencing the open graph', () => {
    const item: NodeGraphFolderItem = {
      type: 'folder',
      name: 'Folder',
      fullPath: 'Folder',
      children: [
        {
          type: 'folder',
          name: 'Nested',
          fullPath: 'Folder/Nested',
          children: [{ type: 'graph', name: 'Caller', graph: graph('caller', 'Folder/Nested/Caller') }],
        },
      ],
    };
    const baseOptions = {
      currentGraph: graph('target', 'Target'),
      dragOverFolderName: undefined,
      draggingItemFolder: undefined,
      fullPath: getGraphListItemPath(item),
      graphReachabilityByGraphId: {},
      item,
      mainGraphId: 'main' as GraphId,
      referencingSelectedGraphIds: new Set(['caller' as GraphId]),
      renamingItemFullPath: undefined,
      runningGraphs: [],
      showUnreachableBadges: true,
    };

    const collapsedPresentation = getFolderItemPresentation({
      ...baseOptions,
      isExpanded: false,
    });

    assert.equal(collapsedPresentation.containsReferencingSelectedGraph, true);

    const expandedPresentation = getFolderItemPresentation({
      ...baseOptions,
      isExpanded: true,
    });

    assert.equal(expandedPresentation.containsReferencingSelectedGraph, false);
  });

  it('skips collapsed folder reference markers when there are no referencing graphs', () => {
    const item: NodeGraphFolderItem = {
      type: 'folder',
      name: 'Folder',
      fullPath: 'Folder',
      children: [{ type: 'graph', name: 'Caller', graph: graph('caller', 'Folder/Caller') }],
    };

    const presentation = getFolderItemPresentation({
      currentGraph: graph('target', 'Target'),
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

    assert.equal(presentation.containsReferencingSelectedGraph, false);
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
    assert.equal(presentation.containsReferencingSelectedGraph, false);
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
