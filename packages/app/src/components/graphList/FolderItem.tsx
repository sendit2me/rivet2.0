import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  type CSSProperties,
  type FC,
  useState,
  useMemo,
  type FocusEvent,
  type KeyboardEvent,
  memo,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { projectMetadataState } from '../../state/savedGraphs.js';
import { range } from 'lodash-es';
import clsx from 'clsx';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { type GraphId, type NodeGraph } from '@ironclad/rivet-core';
import ArrowRightIcon from 'majesticons/line/arrow-right-line.svg?react';
import ArrowDownIcon from 'majesticons/line/arrow-down-line.svg?react';
import MenuLineIcon from 'majesticons/line/menu-line.svg?react';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import TextField from '@atlaskit/textfield';
import { expandedFoldersState } from '../../state/ui';
import { type NodeGraphFolderItem } from './graphFolders';
import { type GraphReachabilityBucket } from '../../utils/graphReachability.js';

export const FolderItem: FC<{
  item: NodeGraphFolderItem;
  runningGraphs: GraphId[];
  renamingItemFullPath: string | undefined;
  graph: NodeGraph;
  graphReachabilityByGraphId: Record<GraphId, GraphReachabilityBucket>;
  depth: number;
  dragOverFolderName: string | undefined;
  draggingItemFolder: string | undefined;
  onGraphSelected?: (savedGraph: NodeGraph) => void;
  onRenameItem: (fullPath: string, newFullPath: string) => void;
  showUnusedBadges: boolean;
}> = memo(
  ({
    item,
    runningGraphs,
    renamingItemFullPath,
    graph,
    graphReachabilityByGraphId,
    draggingItemFolder,
    onGraphSelected,
    onRenameItem,
    depth,
    dragOverFolderName,
    showUnusedBadges,
  }) => {
    const projectMetadata = useAtomValue(projectMetadataState);
    const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersState);

    const savedGraph = item.type === 'graph' ? item.graph : undefined;
    const graphIsRunning = savedGraph && runningGraphs.includes(savedGraph.metadata?.id ?? ('' as GraphId));
    const fullPath = item.type === 'folder' ? item.fullPath : item.graph.metadata?.name ?? 'Untitled Graph';
    const isExpanded = expandedFolders[`${projectMetadata.id}/${fullPath}`] ?? true; // Default open

    const isRenaming = renamingItemFullPath === fullPath;
    const isSelected = graph.metadata?.id === savedGraph?.metadata?.id;
    const isDraggingOver =
      item.type === 'folder' && dragOverFolderName === fullPath && draggingItemFolder !== dragOverFolderName;
    const graphReachability =
      item.type === 'graph' && savedGraph?.metadata?.id ? graphReachabilityByGraphId[savedGraph.metadata.id] : undefined;
    const shouldShowUnusedBadge =
      item.type === 'graph' &&
      !isRenaming &&
      showUnusedBadges &&
      graphReachability === 'unreachable';

    const handleRenameSaved = useStableCallback((newName: string) => {
      onRenameItem(fullPath, fullPath.replace(/[^/]+$/, newName));
    });

    const {
      attributes,
      listeners,
      setNodeRef: setDraggableNodeRef,
      transform,
      isDragging,
    } = useDraggable({ id: fullPath });
    const style: CSSProperties = transform ? { transform: `translate3d(0, ${transform.y}px, 0)`, zIndex: 100 } : {};
    const { setNodeRef: setDroppableNodeRef } = useDroppable({
      id: item.type === 'folder' ? fullPath + '/' : fullPath,
    });

    const virtualDepth = useMemo(
      () =>
        isDragging && item.type === 'folder' && item.fullPath !== dragOverFolderName
          ? dragOverFolderName?.split('/').length ?? 0
          : depth,
      [isDragging, dragOverFolderName, depth, item],
    );

    const setExpanded = useStableCallback((expanded: boolean) => {
      setExpandedFolders((prev) => ({
        ...prev,
        [`${projectMetadata.id}/${fullPath}`]: expanded,
      }));
    });

    return (
      <div ref={setDroppableNodeRef}>
        <div
          className={clsx('folder-item', { 'dragging-over': isDraggingOver, dragging: isDragging })}
          ref={setDraggableNodeRef}
          style={style}
        >
          <div
            className={clsx('graph-item', { selected: isSelected })}
            data-contextmenutype={item.type === 'folder' ? 'graph-folder' : 'graph-item'}
            data-graphid={savedGraph?.metadata?.id}
            data-folderpath={item.type === 'folder' ? item.fullPath : item.graph.metadata?.name}
            title={fullPath}
          >
            {range(virtualDepth + 1).map((idx) => {
              const isSpinner = idx === 0 && graphIsRunning;
              const isExpander = idx === virtualDepth && item.type === 'folder' && !isSpinner;
              return (
                <div className="depthSpacer" key={idx}>
                  {isSpinner && (
                    <div className="spinner">
                      <LoadingSpinner />
                    </div>
                  )}
                  {isExpander && (
                    <div className="expander" onClick={() => setExpanded(!isExpanded)}>
                      {isExpanded ? <ArrowDownIcon /> : <ArrowRightIcon />}
                    </div>
                  )}
                </div>
              );
            })}
            <div
              className="graph-item-select"
              onClick={() => (item.type === 'graph' ? onGraphSelected?.(item.graph) : setExpanded(!isExpanded))}
            >
              {isRenaming ? (
                <FolderItemRename value={fullPath.replace(/.*\//, '')} onSaved={handleRenameSaved} />
              ) : (
                <span>{item.name}</span>
              )}
            </div>
            {shouldShowUnusedBadge && (
              <span className="unused-badge" title="This graph is not reachable from the project's Main Graph.">
                Unused
              </span>
            )}
            <div className="dragger" {...listeners} {...attributes}>
              <MenuLineIcon />
            </div>
          </div>
          {item.type === 'folder' && (
            <div className={clsx('folder-children', { expanded: isExpanded })}>
              {item.children.map((child) => (
                <FolderItem
                  key={child.type === 'graph' ? child.graph.metadata?.id : child.fullPath}
                  item={child}
                  runningGraphs={runningGraphs}
                  renamingItemFullPath={renamingItemFullPath}
                  graph={graph}
                  graphReachabilityByGraphId={graphReachabilityByGraphId}
                  onGraphSelected={onGraphSelected}
                  onRenameItem={onRenameItem}
                  dragOverFolderName={dragOverFolderName}
                  depth={virtualDepth + 1}
                  draggingItemFolder={draggingItemFolder}
                  showUnusedBadges={showUnusedBadges}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
);

FolderItem.displayName = 'FolderItem';

const FolderItemRename: FC<{
  value: string;
  onSaved?: (newName: string) => void;
}> = ({ value, onSaved }) => {
  const [renameValue, setRenameValue] = useState(value);

  const handleRenameFocus = useStableCallback((e: FocusEvent<HTMLInputElement>) => {
    e.target.select();
    e.preventDefault();
  });

  const handleRenameBlur = useStableCallback((e: FocusEvent<HTMLInputElement>) => {
    onSaved?.(renameValue);
  });

  const handleRenameKeyDown = useStableCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSaved?.(renameValue);
    }
  });

  return (
    <TextField
      autoFocus
      onFocus={handleRenameFocus}
      onBlur={handleRenameBlur}
      onKeyDown={handleRenameKeyDown}
      value={renameValue}
      onChange={(e) => setRenameValue((e.target as HTMLInputElement).value)}
    />
  );
};
