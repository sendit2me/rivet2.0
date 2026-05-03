import { DndContext, useDroppable } from '@dnd-kit/core';
import { css } from '@emotion/react';
import { type FC, type MouseEvent, type KeyboardEvent, memo, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { DropdownItem } from '@atlaskit/dropdown-menu';
import Button from '@atlaskit/button';
import Modal, { ModalBody, ModalFooter, ModalTransition } from '@atlaskit/modal-dialog';
import { type GraphId, type NodeGraph } from '@valerypopoff/rivet2-core';
import clsx from 'clsx';
import { runningGraphsState } from '../state/dataFlow.js';
import { pluginsState } from '../state/plugins.js';
import { projectState } from '../state/savedGraphs.js';
import { showGraphReferenceIndicatorsState, showUnreachableGraphTagsState } from '../state/ui.js';
import { useContextMenu } from '../hooks/useContextMenu.js';
import Portal from '@atlaskit/portal';
import CrossIcon from 'majesticons/line/multiply-line.svg?react';
import {
  buildGraphListReachabilityPresentation,
  type GraphListReachabilityPresentation,
} from '../domain/graphEditing/graphListReachability.js';
import { useStableCallback } from '../hooks/useStableCallback.js';
import { useGraphOperations } from '../hooks/useGraphOperations';
import { useGraphListDragDrop } from '../hooks/useGraphListDragDrop';
import { useProjectNodeRegistry } from '../hooks/useProjectNodeRegistry.js';
import {
  getGraphIdsReferencingGraph,
  getGraphReachabilityReport,
  resolveSupportedBuiltInPluginIds,
} from '../utils/graphReachability.js';
import { FolderItem } from './graphList/FolderItem';
import { AppModalHeader } from './AppModalHeader';

const styles = css`
  display: flex;
  flex-direction: column;
  flex-shrink: 1;
  min-height: 100%;

  .graph-list-container {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  .graph-list {
    overflow-y: auto;
    overflow-x: hidden;
    flex: 1 1 auto;
  }

  .graph-list,
  .folder-children {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
    flex-shrink: 1;
    margin-top: 8px;
  }

  .folder-children {
    display: none;
    &.expanded {
      display: flex;
    }
  }

  .graph-item {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    padding: 0 4px;
    font-size: var(--ui-font-size-sm);

    &:hover {
      background-color: var(--grey-darkish);
    }
  }

  .graph-item-select {
    position: relative;
    cursor: pointer;
    padding: 4px 8px;
    flex: 1;
    min-width: 0;
  }

  .graph-item-name {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .graph-item-name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-graph-item .graph-item-name-text {
    font-weight: 700;
  }

  .graph-folder-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: currentColor;
  }

  .graph-main-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: currentColor;
  }

  .graph-folder-count {
    min-width: 18px;
    padding: 2px 6px;
    border-radius: 999px;
    corner-shape: squircle;
    background: var(--grey-darkish);
    color: var(--grey-light);
    flex-shrink: 0;
    font-size: var(--ui-font-size-xs);
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
  }

  .selected .graph-folder-count {
    background: rgba(0, 0, 0, 0.18);
    color: rgba(0, 0, 0, 0.68);
  }

  .graph-reference-dot {
    position: absolute;
    left: -3px;
    top: 50%;
    width: 6px;
    height: 6px;
    transform: translateY(-50%);
    border-radius: 50%;
    background: var(--primary);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18);
  }

  .depthSpacer {
    width: 10px;
    flex-shrink: 0;
  }

  .expander {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .expander svg {
    width: 12px;
    height: 12px;
  }

  .selected {
    background-color: var(--primary);
    color: var(--foreground-on-primary);

    &:hover {
      background-color: var(--primary-dark);
    }
  }

  .selected .spinner svg {
    color: var(--foreground-on-primary);
  }

  .dragger {
    visibility: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
  }

  .graph-item:hover .dragger {
    visibility: visible;
  }

  .graph-list-spacer {
    min-height: 100px;
    flex-grow: 1;
  }

  .dragging-over {
    background: var(--grey-darkish);
  }

  .dragging {
    opacity: 0.5;
  }

  .search {
    position: relative;

    input {
      width: 100%;
      font-size: var(--ui-font-size-sm);
      background: var(--grey-darkerish);
      border: 0;
      border-bottom: 1px solid var(--grey);
      padding: 8px 16px;

      &:focus {
        outline: 0;
        border-bottom: 1px solid var(--primary);
      }
    }

    .clear {
      position: absolute;
      right: 8px;
      top: 6px;
      width: 20px;
      height: 20px;
      background: var(--grey);
      border: 1px solid var(--grey-dark);
      border-radius: 16px;
      corner-shape: squircle;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;

      &:hover {
        background: var(--grey-lightish);
      }

      svg {
        width: 12px;
        height: 12px;
      }
    }
  }

  .graph-list-notice {
    margin: 8px 12px 0;
    padding: 6px 8px;
    border: 1px solid var(--warning);
    border-radius: 12px;
    corner-shape: squircle;
    background: var(--warning-lighter);
    color: var(--warning-dark);
    font-size: var(--ui-font-size-xs);
    line-height: 1.4;
  }

  .unreachable-badge {
    margin-right: 6px;
    padding: 4px 6px;
    border: 1px solid color-mix(in srgb, currentColor 42%, transparent);
    border-radius: 40px;
    corner-shape: superellipse(1.15);
    background: color-mix(in srgb, currentColor 10%, transparent);
    color: color-mix(in srgb, currentColor 72%, transparent);
    font-size: var(--ui-font-size-2xs);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .selected .unreachable-badge {
    border-color: color-mix(in srgb, currentColor 42%, transparent);
    background: color-mix(in srgb, currentColor 10%, transparent);
    color: color-mix(in srgb, currentColor 72%, transparent);
  }
`;

const contextMenuStyles = css`
  border: 1px solid var(--grey);
  box-shadow: 0 3px 5px rgba(0, 0, 0, 0.2);
  background: var(--grey-dark);
  min-width: max-content;

  > button span {
    // This fixes a bug in Ubuntu where the text is missing
    overflow-x: visible !important;
  }
`;

const deleteGraphConfirmBody = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const GraphList: FC<{ onRunGraph?: (graphId: GraphId) => void }> = memo(({ onRunGraph }) => {
  const {
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
  } = useGraphOperations(onRunGraph);

  const { draggingItemFolder, dragOverFolderName, handleDragStart, handleDragEnd, handleDragOver } =
    useGraphListDragDrop(renameFolderItem);

  const runningGraphs = useAtomValue(runningGraphsState);
  const project = useAtomValue(projectState);
  const plugins = useAtomValue(pluginsState);
  const projectNodeRegistry = useProjectNodeRegistry();
  const [graphPendingDelete, setGraphPendingDelete] = useState<NodeGraph | null>(null);
  const showUnreachableGraphTags = useAtomValue(showUnreachableGraphTagsState);
  const showGraphReferenceIndicators = useAtomValue(showGraphReferenceIndicatorsState);

  const { setShowContextMenu, showContextMenu, contextMenuData, handleContextMenu, floatingStyles, refs } =
    useContextMenu();
  const handleSidebarContextMenu = useStableCallback((e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleContextMenu(e);
  });

  const selectedGraphForContextMenu = contextMenuData.data
    ? savedGraphs.find((graph) => graph.metadata!.id === contextMenuData.data?.element.dataset.graphid)
    : null;

  const selectedFolderNameForContextMenu = contextMenuData.data
    ? contextMenuData.data?.element.dataset.folderpath
    : undefined;

  const handleSearchKeyDown = useStableCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchText('');
      (e.target as HTMLElement).blur();
    }
  });

  const graphListReachability = useMemo<GraphListReachabilityPresentation>(() => {
    if (!showUnreachableGraphTags) {
      return {
        bucketByGraphId: {},
        showUnreachableBadges: false,
      };
    }

    const builtInPluginIds = resolveSupportedBuiltInPluginIds(project.plugins);
    const pluginStatesById = new Map(plugins.map((plugin) => [plugin.id, plugin]));
    const graphListPlugins = (project.plugins ?? [])
      .map((spec) => pluginStatesById.get(spec.id))
      .filter((plugin) => plugin != null);

    const report = getGraphReachabilityReport(project, {
      registry: projectNodeRegistry,
      builtInPluginIds,
    });

    return buildGraphListReachabilityPresentation({
      report,
      graphIds: Object.keys(project.graphs) as GraphId[],
      plugins: graphListPlugins,
    });
  }, [plugins, project, projectNodeRegistry, showUnreachableGraphTags]);

  const referencingSelectedGraphIds = useMemo(() => {
    if (!showGraphReferenceIndicators) {
      return new Set<GraphId>();
    }

    const selectedGraphId = graph.metadata?.id;
    return selectedGraphId ? getGraphIdsReferencingGraph(project, selectedGraphId) : new Set<GraphId>();
  }, [graph.metadata?.id, project, showGraphReferenceIndicators]);

  const confirmDeleteGraph = useStableCallback(() => {
    if (!graphPendingDelete) {
      return;
    }

    handleDelete(graphPendingDelete);
    setGraphPendingDelete(null);
  });

  return (
    <div css={styles}>
      <div className="search">
        <input
          autoComplete="off"
          spellCheck={false}
          type="text"
          placeholder="Search..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {searchText.length > 0 && (
          <button className="clear" onClick={() => setSearchText('')}>
            <CrossIcon />
          </button>
        )}
      </div>
      {graphListReachability.notice && <div className="graph-list-notice">{graphListReachability.notice}</div>}
      <div className="graph-list-container" onContextMenu={handleSidebarContextMenu}>
        <div
          className={clsx('graph-list', { 'dragging-over': dragOverFolderName === '' && draggingItemFolder !== '' })}
        >
          <DndContext onDragEnd={handleDragEnd} onDragOver={handleDragOver} onDragStart={handleDragStart}>
            {folderedGraphs.map((item) => (
              <FolderItem
                key={item.type === 'graph' ? item.graph.metadata?.id : item.fullPath}
                item={item}
                runningGraphs={runningGraphs}
                renamingItemFullPath={renamingItemFullPath}
                graph={graph}
                dragOverFolderName={dragOverFolderName}
                draggingItemFolder={draggingItemFolder}
                graphReachabilityByGraphId={graphListReachability.bucketByGraphId}
                referencingSelectedGraphIds={referencingSelectedGraphIds}
                depth={0}
                onGraphSelected={loadGraph}
                onRenameItem={renameFolderItem}
                showUnreachableBadges={graphListReachability.showUnreachableBadges}
              />
            ))}
            <GraphListSpacer />
          </DndContext>
          <Portal>
            {showContextMenu && contextMenuData.data?.type === 'graph-item' && (
              <div
                className="graph-item-context-menu-pos"
                ref={refs.setReference}
                style={{
                  zIndex: 500,
                  position: 'absolute',
                  left: contextMenuData.x,
                  top: contextMenuData.y,
                }}
              >
                <div
                  className="graph-item-context-menu"
                  css={contextMenuStyles}
                  style={floatingStyles}
                  ref={refs.setFloating}
                >
                  <DropdownItem
                    onClick={() => {
                      runGraph(selectedFolderNameForContextMenu!);
                      setShowContextMenu(false);
                    }}
                  >
                    Run
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      startRename(selectedFolderNameForContextMenu!);
                      setShowContextMenu(false);
                    }}
                  >
                    Rename Graph
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      duplicateGraph(selectedGraphForContextMenu!);
                      setShowContextMenu(false);
                    }}
                  >
                    Duplicate
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      if (selectedGraphForContextMenu) {
                        setGraphPendingDelete(selectedGraphForContextMenu);
                      }
                      setShowContextMenu(false);
                    }}
                  >
                    Delete
                  </DropdownItem>
                </div>
              </div>
            )}
            {showContextMenu && contextMenuData.data?.type === 'graph-folder' && (
              <div
                className="graph-item-context-menu-pos"
                ref={refs.setReference}
                style={{
                  zIndex: 500,
                  position: 'absolute',
                  left: contextMenuData.x,
                  top: contextMenuData.y,
                }}
              >
                <div
                  className="graph-item-context-menu"
                  css={contextMenuStyles}
                  style={floatingStyles}
                  ref={refs.setFloating}
                >
                  <DropdownItem
                    onClick={() => {
                      startRename(selectedFolderNameForContextMenu!);
                      setShowContextMenu(false);
                    }}
                  >
                    Rename Folder
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      handleNew(selectedFolderNameForContextMenu!);
                      setShowContextMenu(false);
                    }}
                  >
                    New Graph
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      handleNewFolder(selectedFolderNameForContextMenu!);
                      setShowContextMenu(false);
                    }}
                  >
                    New Folder
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      handleDeleteFolder(selectedFolderNameForContextMenu!);
                      setShowContextMenu(false);
                    }}
                  >
                    Delete
                  </DropdownItem>
                </div>
              </div>
            )}
          </Portal>
        </div>
        <Portal>
          {showContextMenu && contextMenuData.data?.type === 'graph-list' && (
            <div
              className="graph-list-context-menu-pos"
              ref={refs.setReference}
              style={{
                position: 'absolute',
                zIndex: 500,
                left: contextMenuData.x,
                top: contextMenuData.y,
              }}
            >
              <div
                className="graph-list-context-menu"
                css={contextMenuStyles}
                style={floatingStyles}
                ref={refs.setFloating}
              >
                <DropdownItem
                  onClick={() => {
                    handleNew();
                    setShowContextMenu(false);
                  }}
                >
                  New Graph
                </DropdownItem>
                <DropdownItem
                  onClick={() => {
                    handleNewFolder();
                    setShowContextMenu(false);
                  }}
                >
                  New Folder
                </DropdownItem>
                <DropdownItem
                  onClick={() => {
                    importGraph();
                    setShowContextMenu(false);
                  }}
                >
                  Import Graph...
                </DropdownItem>
              </div>
            </div>
          )}
        </Portal>
        <DeleteGraphConfirmModal
          graph={graphPendingDelete}
          onClose={() => setGraphPendingDelete(null)}
          onConfirm={confirmDeleteGraph}
        />
      </div>
    </div>
  );
});

GraphList.displayName = 'GraphList';

// Allows the bottom of the list to be a drop target
export const GraphListSpacer: FC = memo(() => {
  const { setNodeRef: setDroppableNodeRef } = useDroppable({ id: '/' });
  return <div className="graph-list-spacer" ref={setDroppableNodeRef} />;
});

GraphListSpacer.displayName = 'GraphListSpacer';

const DeleteGraphConfirmModal: FC<{
  graph: NodeGraph | null;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ graph, onClose, onConfirm }) => {
  const graphName = graph?.metadata?.name ?? 'Untitled Graph';

  return (
    <ModalTransition>
      {graph && (
        <Modal autoFocus={false} onClose={onClose} width="small">
          <AppModalHeader title="Delete Graph?" onClose={onClose} />
          <ModalBody>
            <div css={deleteGraphConfirmBody}>
              <p>
                Delete <strong>{graphName}</strong>?
              </p>
              <p>This cannot be undone.</p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button appearance="danger" onClick={onConfirm}>
              Delete
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
};
