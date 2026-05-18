import type { ChartNode, GraphId, NodeId, Project } from '@valerypopoff/rivet2-core';
import type { ContextMenuContext } from '../ContextMenu.js';
import type { ContextMenuData } from '../../hooks/useContextMenu.js';
import {
  canPreloadEditorRunFromPlan,
  getEditorRunFromPlan,
} from '../../hooks/remoteExecutorHelpers.js';
import type { RunDataByNodeId } from '../../state/dataFlow.js';

type ProjectNodeRegistry = Parameters<typeof getEditorRunFromPlan>[3];
const NODE_CONTEXT_MENU_TYPE_PREFIX = 'node-';

type NodeContextMenuTarget = {
  nodeId: NodeId;
  nodeType: ChartNode['type'];
};

export function getNodeCanvasContextMenuContext({
  canStartEditorGraphRun,
  contextMenuData,
  lastRunPerNode,
  project,
  projectNodeRegistry,
  selectedGraphId,
}: {
  canStartEditorGraphRun: boolean;
  contextMenuData: ContextMenuData;
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

  return {
    type: 'node',
    data: {
      nodeType: target.nodeType,
      nodeId: target.nodeId,
      canRunFromEditor: canStartEditorGraphRun,
      canRunFromHere: canRunNodeCanvasContextMenuFromHere({
        canStartEditorGraphRun,
        lastRunPerNode,
        nodeId: target.nodeId,
        project,
        projectNodeRegistry,
        selectedGraphId,
      }),
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
  lastRunPerNode,
  nodeId,
  project,
  projectNodeRegistry,
  selectedGraphId,
}: {
  canStartEditorGraphRun: boolean;
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
    return canPreloadEditorRunFromPlan(runFromPlan, lastRunPerNode);
  } catch {
    return false;
  }
}
