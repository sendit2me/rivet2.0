import type { ComponentType } from 'react';
import type { GraphId, NodeGraph } from '@valerypopoff/rivet2-core';
import type { ContextMenuData } from '../../hooks/useContextMenu.js';
import type { ContextMenuItem } from '../../hooks/useContextMenuConfiguration.js';

export type GraphListContextMenuIcons = {
  renameGraph: ComponentType;
  duplicateGraph: ComponentType;
  graphInfo: ComponentType;
  makeMainGraph: ComponentType;
  deleteGraph: ComponentType;
  newGraph: ComponentType;
  newFolder: ComponentType;
  importGraph: ComponentType;
};

export type GraphListContextMenuTarget =
  | {
      type: 'graph-item';
      graph: NodeGraph;
      folderPath: string;
      isMainGraph: boolean;
    }
  | {
      type: 'graph-folder';
      folderPath: string;
    }
  | {
      type: 'graph-list';
    };

type GraphListContextMenuOptions = {
  contextMenuData: ContextMenuData;
  folderPaths?: ReadonlySet<string>;
  savedGraphs: NodeGraph[];
  mainGraphId: GraphId | undefined;
};

export function getGraphListContextMenuTarget({
  contextMenuData,
  folderPaths,
  mainGraphId,
  savedGraphs,
}: GraphListContextMenuOptions): GraphListContextMenuTarget | null {
  const data = contextMenuData.data;

  if (data?.type === 'graph-list') {
    return { type: 'graph-list' };
  }

  if (data?.type === 'graph-folder') {
    const folderPath = data.element.dataset.folderpath;
    if (folderPath == null || (folderPaths && !folderPaths.has(folderPath))) {
      return null;
    }

    return { type: 'graph-folder', folderPath };
  }

  if (data?.type !== 'graph-item') {
    return null;
  }

  const graphId = data.element.dataset.graphid;
  const folderPath = data.element.dataset.folderpath;

  if (graphId == null || folderPath == null) {
    return null;
  }

  const graph = savedGraphs.find((savedGraph) => savedGraph.metadata?.id === graphId);
  if (!graph) {
    return null;
  }

  const currentGraphPath = graph.metadata?.name ?? folderPath;

  return {
    type: 'graph-item',
    graph,
    folderPath: currentGraphPath,
    isMainGraph: graph.metadata?.id === mainGraphId,
  };
}

export function buildGraphItemContextMenuItems(options: {
  icons: GraphListContextMenuIcons;
  isMainGraph: boolean;
}): ContextMenuItem[] {
  const { icons, isMainGraph } = options;

  return [
    {
      id: 'rename-graph',
      label: 'Rename',
      icon: icons.renameGraph,
    },
    {
      id: 'duplicate-graph',
      label: 'Duplicate',
      icon: icons.duplicateGraph,
    },
    {
      id: 'graph-info',
      label: 'Graph info',
      icon: icons.graphInfo,
    },
    ...(!isMainGraph
      ? [
          {
            id: 'make-main-graph',
            label: 'Make main graph',
            icon: icons.makeMainGraph,
            separatorBefore: true,
          },
        ]
      : []),
    {
      id: 'delete-graph',
      label: 'Delete',
      icon: icons.deleteGraph,
      tone: 'danger',
      separatorBefore: true,
    },
  ];
}

export function buildFolderContextMenuItems(icons: GraphListContextMenuIcons): ContextMenuItem[] {
  return [
    {
      id: 'rename-folder',
      label: 'Rename',
      icon: icons.renameGraph,
    },
    {
      id: 'new-graph-in-folder',
      label: 'New Graph',
      icon: icons.newGraph,
    },
    {
      id: 'new-folder-in-folder',
      label: 'New Folder',
      icon: icons.newFolder,
    },
    {
      id: 'delete-folder',
      label: 'Delete',
      icon: icons.deleteGraph,
      tone: 'danger',
      separatorBefore: true,
    },
  ];
}

export function buildGraphListContextMenuItems(icons: GraphListContextMenuIcons): ContextMenuItem[] {
  return [
    {
      id: 'new-graph',
      label: 'New Graph',
      icon: icons.newGraph,
    },
    {
      id: 'new-folder',
      label: 'New Folder',
      icon: icons.newFolder,
    },
    {
      id: 'import-graph',
      label: 'Import Graph...',
      icon: icons.importGraph,
    },
  ];
}
