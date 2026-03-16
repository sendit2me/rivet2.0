import { useState, useMemo } from 'react';
import { produce } from 'immer';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { graphState } from '../state/graph.js';
import { projectMetadataState, savedGraphsState } from '../state/savedGraphs.js';
import { useDeleteGraph } from './useDeleteGraph.js';
import { useLoadGraph } from './useLoadGraph.js';
import { useDuplicateGraph } from './useDuplicateGraph.js';
import { useImportGraph } from './useImportGraph';
import { type GraphId, emptyNodeGraph, type NodeGraph } from '@ironclad/rivet-core';
import { useStableCallback } from './useStableCallback.js';
import { expandedFoldersState } from '../state/ui';
import {
  createFoldersFromGraphs,
  getFolderNames,
  isInFolder,
  type NodeGraphFolderItem,
} from '../components/graphList/graphFolders';
import { toast } from 'react-toastify';
import { useFuseSearch } from './useFuseSearch';

export function useGraphOperations(onRunGraph?: (graphId: GraphId) => void) {
  const projectMetadata = useAtomValue(projectMetadataState);
  const [savedGraphs, setSavedGraphs] = useAtom(savedGraphsState);
  const [graph, setGraph] = useAtom(graphState);

  const [searchText, setSearchText] = useState('');

  const searchedGraphs = useFuseSearch(
    savedGraphs,
    searchText,
    ['metadata.name' as keyof NodeGraph, 'metadata.description' as keyof NodeGraph],
    {},
  );
  const filteredGraphs = useMemo(() => searchedGraphs.map((g) => g.item), [searchedGraphs]);

  // Track the graph that is being renamed, so that we can update the name when the user is done.
  const [renamingItemFullPath, setRenamingItemFullPath] = useState<string | undefined>();

  // Track folders on deletion or creation, so that empty folders aren't automatically deleted.
  const [folderNames, setFolderNames] = useState<string[]>([]);

  const folderedGraphs = useMemo(
    () => createFoldersFromGraphs(filteredGraphs, folderNames),
    [filteredGraphs, folderNames],
  );

  const deleteGraph = useDeleteGraph();
  const loadGraph = useLoadGraph();
  const duplicateGraph = useDuplicateGraph();
  const importGraph = useImportGraph();

  const setExpandedFolders = useSetAtom(expandedFoldersState);

  const startRename = useStableCallback((folderItemName: string) => {
    setRenamingItemFullPath(folderItemName);
  });

  const handleNew = useStableCallback((folderPath?: string) => {
    const graph = emptyNodeGraph();
    let i = 1;
    if (folderPath) {
      if (savedGraphs.some((g) => g.metadata?.name === `${folderPath}/Untitled Graph`)) {
        i++;
      }

      while (savedGraphs.some((g) => g.metadata?.name === `${folderPath}/Untitled Graph ${i}`)) {
        i++;
      }

      graph.metadata!.name = i === 1 ? `${folderPath}/Untitled Graph` : `${folderPath}/Untitled Graph ${i}`;
    } else {
      if (savedGraphs.some((g) => g.metadata?.name === 'Untitled Graph')) {
        i++;
      }

      while (savedGraphs.some((g) => g.metadata?.name === `Untitled Graph ${i}`)) {
        i++;
      }

      graph.metadata!.name = i === 1 ? `Untitled Graph` : `Untitled Graph ${i}`;
    }
    loadGraph(graph);
    setSavedGraphs((prev) => [...prev, graph]);
    startRename(graph.metadata!.name!);
  });

  const handleNewFolder = useStableCallback((parentPath?: string) => {
    const newFolderPath = parentPath ? `${parentPath}/New Folder` : 'New Folder';
    setFolderNames((prev) => [...prev, newFolderPath]);
    startRename(newFolderPath);
    setExpandedFolders((prev) => ({
      ...prev,
      [`${projectMetadata.id}/${newFolderPath}`]: true,
    }));
  });

  const handleDelete = useStableCallback((graph: NodeGraph) => {
    setFolderNames(getFolderNames(folderedGraphs));
    deleteGraph(graph);
  });

  const handleDeleteFolder = useStableCallback((folderName: string) => {
    const graphsToDelete = savedGraphs.filter(
      (graph) => graph.metadata?.name && isInFolder(folderName, graph.metadata?.name),
    );
    graphsToDelete.forEach((graph) => deleteGraph(graph));
    const newFolderNames = folderNames.filter((name) => folderName !== name && !isInFolder(folderName, name));
    setFolderNames(newFolderNames);
  });

  const runGraph = useStableCallback((folderName: string) => {
    const graph = savedGraphs.find((graph) => graph.metadata?.name === folderName);
    if (graph) {
      onRunGraph?.(graph.metadata!.id!);
    }
  });

  const renameFolderItem = useStableCallback((fullPath: string, newFullPath: string, itemId?: string) => {
    if (fullPath === newFullPath || !newFullPath || /\/$/.test(newFullPath)) {
      setRenamingItemFullPath(undefined);
      return;
    }

    if (newFullPath.split('/').some((part) => part === '')) {
      toast.error('Names contains invalid segments');
      return;
    }

    if (savedGraphs.some((g) => g.metadata?.name === newFullPath) || folderNames.includes(newFullPath)) {
      toast.error('A graph or folder with that name already exists.');
      return;
    }

    setSavedGraphs((prev) => {
      return prev.map((g) => {
        if (g.metadata?.name && (fullPath === g.metadata.name || isInFolder(fullPath, g.metadata.name))) {
          return {
            ...g,
            metadata: {
              ...g.metadata,
              name: g.metadata.name.replace(fullPath, newFullPath),
            },
          };
        }
        return g;
      });
    });

    setGraph((prev) =>
      produce(prev, (draft) => {
        const metadata = draft.metadata ?? { name: '' };
        metadata.name = metadata.name!.replace(fullPath, newFullPath);
        draft.metadata = metadata;
      }),
    );

    const newFolderNames = folderNames.map((name) =>
      name === fullPath || isInFolder(fullPath, name) ? name.replace(fullPath, newFullPath) : name,
    );
    setFolderNames(newFolderNames);

    setRenamingItemFullPath(undefined);
    setExpandedFolders((prev) => ({
      ...prev,
      [`${projectMetadata.id}/${newFullPath}`]: prev[`${projectMetadata.id}/${fullPath}`] ?? false,
    }));
  });

  return {
    graph,
    savedGraphs,
    searchText,
    setSearchText,
    renamingItemFullPath,
    folderedGraphs,
    loadGraph,
    duplicateGraph,
    importGraph,
    handleNew,
    handleNewFolder,
    handleDelete,
    handleDeleteFolder,
    runGraph,
    startRename,
    renameFolderItem,
  };
}
