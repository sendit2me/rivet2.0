import type { GraphId, NodeId } from '@valerypopoff/rivet2-core';
import { isNodeGraphSearchMatch } from '../../hooks/graphSearch.js';
import { isGraphSearchVisibleWithQuery, type GraphSearchState } from '../../state/graphBuilder.js';

const EMPTY_NODE_IDS: NodeId[] = [];

export function getCanvasSelectedInteractionNodeIds({
  editingNodeId,
  fullscreenOutputNodeId,
  selectedNodeIds,
}: {
  editingNodeId: NodeId | null;
  fullscreenOutputNodeId: NodeId | null;
  selectedNodeIds: readonly NodeId[];
}): NodeId[] {
  const nextSelectedNodeIds = new Set(selectedNodeIds);

  if (editingNodeId) {
    nextSelectedNodeIds.add(editingNodeId);
  }

  if (fullscreenOutputNodeId) {
    nextSelectedNodeIds.add(fullscreenOutputNodeId);
  }

  return [...nextSelectedNodeIds];
}

export function getCanvasSearchMatchingNodeIds({
  matches,
  panelOpen,
  query,
  searching,
  selectedGraphId,
}: {
  matches: GraphSearchState['matches'];
  panelOpen: boolean;
  query: string;
  searching: boolean;
  selectedGraphId: GraphId | undefined;
}): NodeId[] {
  if (!isGraphSearchVisibleWithQuery({ panelOpen, query, searching })) {
    return EMPTY_NODE_IDS;
  }

  return matches
    .filter(isNodeGraphSearchMatch)
    .filter((match) => match.graphId === selectedGraphId)
    .map((match) => match.nodeId);
}

export function getCanvasHighlightedNodeIds({
  hoveringNodeId,
  isPortHovered,
  selectedNodeIds,
}: {
  hoveringNodeId: NodeId | undefined;
  isPortHovered: boolean;
  selectedNodeIds: readonly NodeId[];
}): NodeId[] {
  const highlightedNodeIds = new Set(selectedNodeIds);

  if (hoveringNodeId && !isPortHovered) {
    highlightedNodeIds.add(hoveringNodeId);
  }

  return [...highlightedNodeIds];
}
