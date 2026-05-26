import type { ChartNode, FrozenNodeOutputsByGraph, GraphId, NodeId, Project } from '@valerypopoff/rivet2-core';
import type { ContextMenuContext } from '../ContextMenu.js';
import type { ContextMenuData } from '../../hooks/useContextMenu.js';
import {
  canPreloadEditorRunFromPlan,
  getEditorRunFromPlan,
} from '../../hooks/remoteExecutorHelpers.js';
import type { GraphRunRecord, GraphRunSelection, RunDataByNodeId } from '../../state/dataFlow.js';
import { canFreezeNodeOutputs } from '../../utils/frozenNodeOutputs.js';

type ProjectNodeRegistry = Parameters<typeof getEditorRunFromPlan>[3];
const NODE_CONTEXT_MENU_TYPE_PREFIX = 'node-';

type NodeContextMenuTarget = {
  nodeId: NodeId;
  nodeType: ChartNode['type'];
};

export function getNodeCanvasContextMenuContext({
  canStartEditorGraphRun,
  canUseFrozenNodes,
  contextMenuData,
  frozenNodeOutputs,
  graphSelection,
  lastRunPerNode,
  project,
  projectNodeRegistry,
  selectedGraphId,
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
  project: Project;
  projectNodeRegistry: ProjectNodeRegistry;
  selectedGraphId: GraphId | undefined;
}): ContextMenuContext {
  const target = getNodeCanvasContextMenuTarget(contextMenuData.data);

  if (!target) {
    return {
      type: 'blankArea',
      data: {},
    };
  }

  const isFrozen = Boolean(selectedGraphId && frozenNodeOutputs[selectedGraphId]?.[target.nodeId]?.length);

  return {
    type: 'node',
    data: {
      nodeType: target.nodeType,
      nodeId: target.nodeId,
      canRunFromEditor: canStartEditorGraphRun,
      canRunFromHere: canRunNodeCanvasContextMenuFromHere({
        canStartEditorGraphRun,
        frozenNodeOutputs,
        lastRunPerNode,
        nodeId: target.nodeId,
        project,
        projectNodeRegistry,
        selectedGraphId,
      }),
      canFreeze:
        canUseFrozenNodes &&
        target.nodeType !== 'comment' &&
        !isFrozen &&
        Boolean(
          selectedGraphId &&
            canFreezeNodeOutputs({
              graphId: selectedGraphId,
              processData: lastRunPerNode[target.nodeId],
              selection: graphSelection,
            }),
        ),
      canUnfreeze:
        canUseFrozenNodes &&
        target.nodeType !== 'comment' &&
        isFrozen,
      isFrozen,
    },
  };
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
