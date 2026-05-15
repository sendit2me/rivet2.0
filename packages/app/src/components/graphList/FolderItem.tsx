import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  type CSSProperties,
  type FC,
  useEffect,
  useRef,
  useState,
  useMemo,
  type FocusEvent,
  type KeyboardEvent,
  memo,
  type SVGProps,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { projectMetadataState } from '../../state/savedGraphs.js';
import clsx from 'clsx';
import { type GraphId, type NodeGraph } from '@valerypopoff/rivet2-core';
import FolderIcon from 'majesticons/line/folder-line.svg?react';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import TextField from '@atlaskit/textfield';
import { expandedFoldersState } from '../../state/ui';
import { countGraphsInFolder, isInFolder, type NodeGraphFolderItem } from './graphFolders';
import { type GraphReachabilityBucket } from '../../utils/graphReachability.js';
import { MainGraphIcon } from './MainGraphIcon';
import { NodeRunningIndicator } from '../visualNode/NodeRunningIndicator.js';

export const FolderItem: FC<{
  item: NodeGraphFolderItem;
  runningGraphs: GraphId[];
  renamingItemFullPath: string | undefined;
  graph: NodeGraph;
  graphReachabilityByGraphId: Record<GraphId, GraphReachabilityBucket>;
  referencingSelectedGraphIds: ReadonlySet<GraphId>;
  depth: number;
  dragOverFolderName: string | undefined;
  draggingItemFolder: string | undefined;
  onGraphSelected?: (savedGraph: NodeGraph) => void;
  onRenameItem: (fullPath: string, newFullPath: string) => void;
  showUnreachableBadges: boolean;
}> = memo(
  ({
    item,
    runningGraphs,
    renamingItemFullPath,
    graph,
    graphReachabilityByGraphId,
    referencingSelectedGraphIds,
    draggingItemFolder,
    onGraphSelected,
    onRenameItem,
    depth,
    dragOverFolderName,
    showUnreachableBadges,
  }) => {
    const projectMetadata = useAtomValue(projectMetadataState);
    const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersState);

    const savedGraph = item.type === 'graph' ? item.graph : undefined;
    const graphIsRunning = savedGraph && runningGraphs.includes(savedGraph.metadata?.id ?? ('' as GraphId));
    const fullPath = item.type === 'folder' ? item.fullPath : item.graph.metadata?.name ?? 'Untitled Graph';
    const isExpanded = expandedFolders[`${projectMetadata.id}/${fullPath}`] ?? true; // Default open

    const isRenaming = renamingItemFullPath === fullPath;
    const isSelected = graph.metadata?.id === savedGraph?.metadata?.id;
    const openGraphName = graph.metadata?.name;
    const isCollapsedOpenGraphFolder =
      item.type === 'folder' && !isExpanded && openGraphName != null && isInFolder(fullPath, openGraphName);
    const isMainGraph = item.type === 'graph' && savedGraph?.metadata?.id === projectMetadata.mainGraphId;
    const referencesSelectedGraph =
      item.type === 'graph' && savedGraph?.metadata?.id
        ? referencingSelectedGraphIds.has(savedGraph.metadata.id)
        : false;
    const isDraggingOver =
      item.type === 'folder' && dragOverFolderName === fullPath && draggingItemFolder !== dragOverFolderName;
    const graphReachability =
      item.type === 'graph' && savedGraph?.metadata?.id
        ? graphReachabilityByGraphId[savedGraph.metadata.id]
        : undefined;
    const folderGraphCount = item.type === 'folder' ? countGraphsInFolder(item) : undefined;
    const shouldShowUnreachableBadge =
      item.type === 'graph' && !isRenaming && showUnreachableBadges && graphReachability === 'unreachable';

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
    const suppressNextClickRef = useRef(false);
    const draggableRowProps = isRenaming ? {} : { ...listeners, ...attributes };
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
    const graphItemStyle = { '--graph-item-indent': `${virtualDepth * 20}px` } as CSSProperties;

    const setExpanded = useStableCallback((expanded: boolean) => {
      setExpandedFolders((prev) => ({
        ...prev,
        [`${projectMetadata.id}/${fullPath}`]: expanded,
      }));
    });

    useEffect(() => {
      if (isDragging) {
        suppressNextClickRef.current = true;
      }
    }, [isDragging]);

    const handleItemClick = useStableCallback(() => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

      if (item.type === 'graph') {
        onGraphSelected?.(item.graph);
      } else {
        setExpanded(!isExpanded);
      }
    });

    return (
      <div ref={setDroppableNodeRef}>
        <div
          className={clsx('folder-item', { 'dragging-over': isDraggingOver, dragging: isDragging })}
          ref={setDraggableNodeRef}
          style={style}
        >
          <div
            className={clsx('graph-item', {
              selected: isSelected,
              'folder-graph-item': item.type === 'folder',
              'contains-open-graph': isCollapsedOpenGraphFolder,
            })}
            data-contextmenutype={item.type === 'folder' ? 'graph-folder' : 'graph-item'}
            data-graphid={savedGraph?.metadata?.id}
            data-folderpath={item.type === 'folder' ? item.fullPath : item.graph.metadata?.name}
            style={graphItemStyle}
            title={[
              fullPath,
              isCollapsedOpenGraphFolder ? 'Contains the open graph.' : undefined,
              isMainGraph ? 'Main graph.' : undefined,
              referencesSelectedGraph ? 'References the open graph.' : undefined,
            ]
              .filter(Boolean)
              .join('\n')}
          >
            <div className="graph-item-select" {...draggableRowProps} onClick={handleItemClick}>
              {isRenaming ? (
                <FolderItemRename value={fullPath.replace(/.*\//, '')} onSaved={handleRenameSaved} />
              ) : (
                <>
                  {graphIsRunning && (
                    <div className="spinner">
                      <NodeRunningIndicator isRunning delayMs={0} label="Graph running" />
                    </div>
                  )}
                  {referencesSelectedGraph && <span className="graph-reference-dot" aria-hidden="true" />}
                  <span className="graph-item-name">
                    {item.type === 'folder' &&
                      (isExpanded ? (
                        <OpenFolderIcon className="graph-folder-icon" aria-hidden="true" />
                      ) : (
                        <FolderIcon className="graph-folder-icon" aria-hidden="true" />
                      ))}
                    <span className="graph-item-name-text">{item.name}</span>
                    {isMainGraph && <MainGraphIcon className="graph-main-icon" />}
                    {folderGraphCount != null && (
                      <span className="graph-folder-count">
                        <span>{folderGraphCount}</span>
                      </span>
                    )}
                  </span>
                </>
              )}
              {shouldShowUnreachableBadge && (
                <span className="unreachable-badge" title="This graph is unreachable from the project's Main Graph.">
                  unreachable
                </span>
              )}
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
                  referencingSelectedGraphIds={referencingSelectedGraphIds}
                  onGraphSelected={onGraphSelected}
                  onRenameItem={onRenameItem}
                  dragOverFolderName={dragOverFolderName}
                  depth={virtualDepth + 1}
                  draggingItemFolder={draggingItemFolder}
                  showUnreachableBadges={showUnreachableBadges}
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

const OpenFolderIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <path
      d="M3 11V6a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 13.07 7H19a2 2 0 0 1 2 2v2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 11h18l-2 7a2 2 0 0 1-1.92 1.45H5.92A2 2 0 0 1 4 18l-1-7Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
