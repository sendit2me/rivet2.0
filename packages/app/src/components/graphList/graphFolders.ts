import { orderBy } from 'lodash-es';
import { type NodeGraph } from '@ironclad/rivet-core';

export interface NodeGraphFolder {
  type: 'folder';
  name: string;
  fullPath: string;
  children: NodeGraphFolderItem[];
}

export interface NodeGraphFolderGraph {
  type: 'graph';
  name: string;
  graph: NodeGraph;
}

export type NodeGraphFolderItem = NodeGraphFolder | NodeGraphFolderGraph;

export function createFoldersFromGraphs(graphs: NodeGraph[], folderNames: string[]): NodeGraphFolderItem[] {
  const rootFolder: NodeGraphFolder = {
    name: '',
    fullPath: '',
    type: 'folder',
    children: [],
  };

  folderNames.forEach((folderName) => {
    let currentFolder = rootFolder;
    const folderNameParts = folderName.split('/');

    for (let index = 0; index < folderNameParts.length; index++) {
      const folderPart = folderNameParts[index] ?? '';
      const existingFolder = currentFolder.children.find(
        (child): child is NodeGraphFolder => child.name === folderPart && child.type === 'folder',
      );

      if (existingFolder) {
        currentFolder = existingFolder;
        continue;
      }

      const newFolder: NodeGraphFolder = {
        name: folderPart,
        fullPath: folderNameParts.slice(0, index + 1).join('/'),
        type: 'folder',
        children: [],
      };

      currentFolder.children.push(newFolder);
      currentFolder = newFolder;
    }
  });

  graphs.forEach((graph) => {
    const graphNameParts = graph.metadata?.name?.split('/') ?? [];
    let currentFolder = rootFolder;

    for (let index = 0; index < graphNameParts.length - 1; index++) {
      const folderName = graphNameParts[index] ?? '';
      const existingFolder = currentFolder.children.find(
        (child): child is NodeGraphFolder => child.name === folderName && child.type === 'folder',
      );

      if (existingFolder) {
        currentFolder = existingFolder;
        continue;
      }

      const newFolder: NodeGraphFolder = {
        name: folderName,
        fullPath: graphNameParts.slice(0, index + 1).join('/'),
        type: 'folder',
        children: [],
      };

      currentFolder.children.push(newFolder);
      currentFolder = newFolder;
    }

    currentFolder.children.push({
      name: graphNameParts[graphNameParts.length - 1] ?? '',
      type: 'graph',
      graph,
    });
  });

  const sortFolder = (folder: NodeGraphFolder) => {
    folder.children = orderBy(folder.children, ['type', 'name'], ['asc', 'asc']);
    folder.children.forEach((child) => {
      if (child.type === 'folder') {
        sortFolder(child);
      }
    });
  };

  sortFolder(rootFolder);
  return rootFolder.children;
}

export function isInFolder(folderPath: string, itemPath: string): boolean {
  return itemPath.startsWith(folderPath + '/');
}

export function getFolderNames(folderedGraphs: NodeGraphFolderItem[]): string[] {
  const folderNames: string[] = [];

  const traverseFolder = (folder: NodeGraphFolderItem) => {
    if (folder.type === 'folder') {
      folder.children.forEach(traverseFolder);
      folderNames.push(folder.fullPath);
    }
  };

  folderedGraphs.forEach(traverseFolder);
  return folderNames;
}

export function countGraphsInFolder(folder: NodeGraphFolder): number {
  return folder.children.reduce((count, child) => {
    if (child.type === 'graph') {
      return count + 1;
    }

    return count + countGraphsInFolder(child);
  }, 0);
}
