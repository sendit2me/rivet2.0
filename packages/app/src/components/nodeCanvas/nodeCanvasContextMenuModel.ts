import type { ChartNode, FrozenNodeOutputsByGraph, GraphId, NodeId, Project } from '@valerypopoff/rivet2-core';
import type { ContextMenuContext } from '../ContextMenu.js';
import type { ContextMenuData } from '../../hooks/useContextMenu.js';
import {
  canPreloadEditorRunFromPlan,
  getEditorRunFromPlan,
} from '../../hooks/remoteExecutorHelpers.js';
import type { GraphRunRecord, GraphRunSelection, RunDataByNodeId } from '../../state/dataFlow.js';
import { canFreezeNodeOutputs, canNodeTypeBeFrozen } from '../../utils/frozenNodeOutputs.js';

type ProjectNodeRegistry = Parameters<typeof getEditorRunFromPlan>[3];
const NODE_CONTEXT_MENU_TYPE_PREFIX = 'node-';

type NodeContextMenuTarget = {
  nodeId: NodeId;
  nodeType: ChartNode['type'];
};

type NodesById = Readonly<Record<NodeId, ChartNode | undefined>>;

export function getNodeCanvasContextMenuContext({
  canStartEditorGraphRun,
  canUseFrozenNodes,
  contextMenuData,
  frozenNodeOutputs,
  graphSelection,
  lastRunPerNode,
  nodesById = {},
  project,
  projectNodeRegistry,
  selectedGraphId,
  selectedNodeIds = [],
}: {
  canStartEditorGraphRun: boolean;
  canUseFrozenNodes: boolean;
  contextMenuData: ContextMenuData;
  frozenNodeOutputs: FrozenNodeOutputsByGraph;
  graphSelection: {
    graphRuns?: GraphRunRecord[];
    selectedGraphRun?: GraphRunSelection;
  };
  lastRunPerNode: RunDataByNodeId;
  nodesById?: NodesById;
  project: Project;
  projectNodeRegistry: ProjectNodeRegistry;
  selectedGraphId: GraphId | undefined;
  selectedNodeIds?: readonly NodeId[];
}): ContextMenuContext {
  const target = getNodeCanvasContextMenuTarget(contextMenuData.data);

  if (!target) {
    return {
      type: 'blankArea',
      data: {},
    };
  }

  const isFrozen = Boolean(selectedGraphId && frozenNodeOutputs[selectedGraphId]?.[target.nodeId]?.length);
  const scopedTargets = getNodeCanvasContextMenuScopedTargets({ nodesById, selectedNodeIds, target });
  const frozenOutputsByNode = selectedGraphId ? frozenNodeOutputs[selectedGraphId] : undefined;
  const freezeNodeTargets =
    canUseFrozenNodes && selectedGraphId
      ? scopedTargets.filter(
          (scopedTarget) =>
            canNodeTypeBeFrozen(scopedTarget.nodeType) &&
            !frozenOutputsByNode?.[scopedTarget.nodeId]?.length &&
            canFreezeNodeOutputs({
              graphId: selectedGraphId,
              processData: lastRunPerNode[scopedTarget.nodeId],
              selection: graphSelection,
            }),
        )
      : [];
  const unfreezeNodeIds =
    canUseFrozenNodes && selectedGraphId
      ? scopedTargets
          .filter((scopedTarget) => Boolean(frozenOutputsByNode?.[scopedTarget.nodeId]?.length))
          .map((scopedTarget) => scopedTarget.nodeId)
      : [];

  return {
    type: 'node',
    data: {
      nodeType: target.nodeType,
      nodeId: target.nodeId,
      canRunFromEditor: canStartEditorGraphRun,
      canRunFromHere: canRunNodeCanvasContextMenuFromHere({
        canStartEditorGraphRun,
        frozenNodeOutputs: canUseFrozenNodes ? frozenNodeOutputs : undefined,
        lastRunPerNode,
        nodeId: target.nodeId,
        project,
        projectNodeRegistry,
        selectedGraphId,
      }),
      canFreeze: freezeNodeTargets.length > 0,
      canUnfreeze: unfreezeNodeIds.length > 0,
      freezeNodeTargets,
      unfreezeNodeIds,
      isFrozen,
    },
  };
}

function getNodeCanvasContextMenuScopedTargets({
  nodesById,
  selectedNodeIds,
  target,
}: {
  nodesById: NodesById;
  selectedNodeIds: readonly NodeId[];
  target: NodeContextMenuTarget;
}): NodeContextMenuTarget[] {
  if (selectedNodeIds.length <= 1 || !selectedNodeIds.includes(target.nodeId)) {
    return [target];
  }

  const selectedTargets = [...new Set(selectedNodeIds)].flatMap((selectedNodeId): NodeContextMenuTarget[] => {
    const selectedNode = nodesById[selectedNodeId];
    return selectedNode ? [{ nodeId: selectedNode.id, nodeType: selectedNode.type }] : [];
  });

  return selectedTargets.length > 0 ? selectedTargets : [target];
}

export function getNodeCanvasContextMenuTarget(
  target: ContextMenuData['data'],
): NodeContextMenuTarget | undefined {
  const nodeType = target?.type.startsWith(NODE_CONTEXT_MENU_TYPE_PREFIX)
    ? target.type.slice(NODE_CONTEXT_MENU_TYPE_PREFIX.length)
    : '';
  const nodeId = target?.element.dataset.nodeid;
  if (!nodeId || !nodeType) {
    return undefined;
  }

  return {
    nodeId: nodeId as NodeId,
    nodeType: nodeType as ChartNode['type'],
  };
}

export function canRunNodeCanvasContextMenuFromHere({
  canStartEditorGraphRun,
  frozenNodeOutputs,
  lastRunPerNode,
  nodeId,
  project,
  projectNodeRegistry,
  selectedGraphId,
}: {
  canStartEditorGraphRun: boolean;
  frozenNodeOutputs?: FrozenNodeOutputsByGraph;
  lastRunPerNode: RunDataByNodeId;
  nodeId: NodeId;
  project: Project;
  projectNodeRegistry: ProjectNodeRegistry;
  selectedGraphId: GraphId | undefined;
}): boolean {
  if (!canStartEditorGraphRun || !selectedGraphId) {
    return false;
  }

  try {
    const runFromPlan = getEditorRunFromPlan(project, selectedGraphId, nodeId, projectNodeRegistry);
    return canPreloadEditorRunFromPlan(runFromPlan, lastRunPerNode, { frozenNodeOutputs, graphId: selectedGraphId });
  } catch {
    return false;
  }
}
