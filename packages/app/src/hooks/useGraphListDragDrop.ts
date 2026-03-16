import { useState } from 'react';
import { type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { useStableCallback } from './useStableCallback.js';
import { isInFolder } from '../components/graphList/graphFolders';

export function useGraphListDragDrop(renameFolderItem: (fullPath: string, newFullPath: string) => void) {
  const [draggingItemFullPath, setDraggingItemFullPath] = useState<string | undefined>();
  const draggingItemFolder = draggingItemFullPath?.split('/').slice(0, -1).join('/');

  const [dragOverFolderName, setDragOverFolderName] = useState<string | undefined>();

  const handleDragStart = useStableCallback((drag: DragStartEvent) => {
    const activeFullPath = drag.active?.id as string;
    setDraggingItemFullPath(activeFullPath);
  });

  const handleDragEnd = useStableCallback((dragResult: DragEndEvent) => {
    setDragOverFolderName(undefined);
    const activeFullPath = dragResult.active?.id as string;
    const overFullPath = dragResult.over?.id as string;
    if (overFullPath && activeFullPath) {
      if (isInFolder(activeFullPath, overFullPath)) {
        // Don't allow dragging into a folder that is a child of the active item
        return;
      }
      const overFolderName = overFullPath.indexOf('/') > 0 ? overFullPath.replace(/\/[^/]*$/, '') : '';
      // Get the last part of the active id's name
      const itemName = activeFullPath.split('/').pop()!;
      const newItemFullPath = overFolderName === '' ? itemName : `${overFolderName}/${itemName}`;
      if (activeFullPath !== newItemFullPath) {
        renameFolderItem(activeFullPath, newItemFullPath);
      }
    }
  });

  const handleDragOver = useStableCallback((dragOver: DragOverEvent) => {
    const overFullPath = dragOver.over?.id as string;
    if (overFullPath == null) {
      setDragOverFolderName(undefined);
    } else {
      setDragOverFolderName(overFullPath.indexOf('/') > 0 ? overFullPath.replace(/\/[^/]*$/, '') : '');
    }
  });

  return {
    draggingItemFullPath,
    draggingItemFolder,
    dragOverFolderName,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
  };
}
