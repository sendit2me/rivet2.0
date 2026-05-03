import { useSetAtom } from 'jotai';
import { type GraphCommandState, commandHistoryStackStatePerGraph, type CommandData, useCommand } from './Command';
import {
  type NodeId,
  type NodeConnection,
  type ChartNode,
  type GraphId,
  type NodeGraph,
  type NodeRegistration,
} from '@valerypopoff/rivet2-core';
import { nodesState, connectionsState } from '../state/graph';
import { produce } from 'immer';
import { useProjectNodeRegistry } from '../hooks/useProjectNodeRegistry';
import {
  getRecoverableNodeConnectionsForNode,
  recoverableNodeConnectionsStatePerGraph,
  setRecoverableNodeConnectionsForGraphNode,
} from '../state/recoverableNodeConnections';
import { reconcileNodeEditConnections } from '../domain/graphEditing/editNodeConnectionRecovery';
import {
  propagateGraphInputRename,
  rewriteSubGraphCallerGraphForGraphInputRename,
  type GraphInputRenameProjectGraphSnapshots,
} from '../domain/graphEditing/graphInputRenamePropagation';
import { projectState } from '../state/savedGraphs';

const MERGE_WINDOW_MS = 5000;

type EditNodeParams = {
  nodeId: NodeId;
  newNode: Partial<ChartNode>;
  previousNodeOverride?: Partial<ChartNode>;
};

type EditNodeAppliedData = {
  previousNode: Partial<ChartNode>;
  previousConnections: NodeConnection[];
  previousCurrentNodes?: ChartNode[];
  nextCurrentNodes?: ChartNode[];
  nextConnections: NodeConnection[];
  previousRecoverableConnections: NodeConnection[];
  nextRecoverableConnections: NodeConnection[];
  projectGraphSnapshots?: GraphInputRenameProjectGraphSnapshots;
};

type GraphInputRename = {
  newInputId: string;
  oldInputId: string;
  targetGraphId: GraphId;
};

function cloneConnections(connections: readonly NodeConnection[]): NodeConnection[] {
  return structuredClone([...connections]);
}

function cloneNodes(nodes: readonly ChartNode[]): ChartNode[] {
  return structuredClone([...nodes]);
}

function getGraphInputId(node: Partial<ChartNode> | undefined): string | undefined {
  if ((node as { type?: string } | undefined)?.type !== 'graphInput') {
    return undefined;
  }

  const id = (node?.data as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
}

export function shouldMergeEditNodeCommand(
  lastCommand: CommandData<any, any> | undefined,
  nodeId: NodeId,
  now = Date.now(),
): boolean {
  return !!(
    lastCommand &&
    now - lastCommand.timestamp <= MERGE_WINDOW_MS &&
    lastCommand.command.type === 'editNode' &&
    lastCommand.data.nodeId === nodeId
  );
}

function replaceNodeInGraph(nodes: readonly ChartNode[], nodeId: NodeId, newNode: Partial<ChartNode>): ChartNode[] {
  return produce([...nodes], (draft) => {
    const index = draft.findIndex((node) => node.id === nodeId);

    if (index < 0) {
      throw new Error(`Node with id ${nodeId} not found`);
    }

    draft[index] = {
      ...draft[index],
      ...structuredClone(newNode),
    } as ChartNode;
  });
}

function removeLastCommandHistoryEntryForGraph(
  stacks: Record<string, CommandData<any, any>[]>,
  graphId: string | undefined,
): Record<string, CommandData<any, any>[]> {
  if (!graphId) {
    return stacks;
  }

  const stack = stacks[graphId] ?? [];

  return {
    ...stacks,
    [graphId]: stack.slice(0, -1),
  };
}

function getNextProjectFromGraphSnapshots(
  project: GraphCommandState['project'],
  snapshots: GraphInputRenameProjectGraphSnapshots | undefined,
  snapshotKey: 'nextGraph' | 'previousGraph',
) {
  if (!snapshots || Object.keys(snapshots).length === 0) {
    return project;
  }

  return produce(project, (draft) => {
    for (const [graphId, snapshot] of Object.entries(snapshots) as Array<
      [GraphId, GraphInputRenameProjectGraphSnapshots[GraphId]]
    >) {
      draft.graphs[graphId] = structuredClone(snapshot[snapshotKey]);
    }
  });
}

function mergeProjectGraphSnapshots({
  currentProject,
  originalRename,
  previousSnapshots,
  nextSnapshots,
}: {
  currentProject: GraphCommandState['project'];
  originalRename: GraphInputRename | undefined;
  previousSnapshots: GraphInputRenameProjectGraphSnapshots | undefined;
  nextSnapshots: GraphInputRenameProjectGraphSnapshots;
}): GraphInputRenameProjectGraphSnapshots | undefined {
  const mergedSnapshots: GraphInputRenameProjectGraphSnapshots = structuredClone(nextSnapshots);

  for (const [graphId, previousSnapshot] of Object.entries(previousSnapshots ?? {}) as Array<
    [GraphId, GraphInputRenameProjectGraphSnapshots[GraphId]]
  >) {
    const nextGraph = originalRename
      ? getNextGraphFromOriginalRenameSnapshot(previousSnapshot.previousGraph, originalRename)
      : mergedSnapshots[graphId]?.nextGraph ?? currentProject.graphs[graphId] ?? previousSnapshot.nextGraph;

    mergedSnapshots[graphId] = {
      previousGraph: structuredClone(previousSnapshot.previousGraph),
      nextGraph: structuredClone(nextGraph),
    };
  }

  return Object.keys(mergedSnapshots).length > 0 ? mergedSnapshots : undefined;
}

function getNextGraphFromOriginalRenameSnapshot(graph: NodeGraph, rename: GraphInputRename): NodeGraph {
  if (rename.oldInputId === rename.newInputId) {
    return structuredClone(graph);
  }

  return rewriteSubGraphCallerGraphForGraphInputRename({
    graph,
    newInputId: rename.newInputId,
    oldInputId: rename.oldInputId,
    targetGraphId: rename.targetGraphId,
  }).graph;
}

function getOriginalGraphInputRename({
  currentGraphId,
  editedNodeId,
  nextCurrentNodes,
  previousNode,
}: {
  currentGraphId: GraphId | undefined;
  editedNodeId: NodeId;
  nextCurrentNodes: readonly ChartNode[];
  previousNode: Partial<ChartNode>;
}): GraphInputRename | undefined {
  if (!currentGraphId) {
    return undefined;
  }

  const oldInputId = getGraphInputId(previousNode);
  const newInputId = getGraphInputId(nextCurrentNodes.find((node) => node.id === editedNodeId));

  if (oldInputId == null || newInputId == null) {
    return undefined;
  }

  const oldInputStillExists = nextCurrentNodes.some(
    (node) => node.id !== editedNodeId && getGraphInputId(node) === oldInputId,
  );

  if (oldInputStillExists) {
    return undefined;
  }

  return {
    newInputId,
    oldInputId,
    targetGraphId: currentGraphId,
  };
}

function buildPreviousCurrentNodesForMergedEdit({
  currentNodes,
  editedNodeId,
  previousCurrentNodes,
  previousNode,
}: {
  currentNodes: readonly ChartNode[];
  editedNodeId: NodeId;
  previousCurrentNodes: readonly ChartNode[] | undefined;
  previousNode: Partial<ChartNode>;
}): ChartNode[] {
  return previousCurrentNodes
    ? cloneNodes(previousCurrentNodes)
    : replaceNodeInGraph(currentNodes, editedNodeId, previousNode);
}

function getMergedGraphInputRenameResult({
  currentGraphId,
  graphInputRenameResult,
  isMergedEdit,
  nextNodes,
  originalRename,
  params,
  previousConnections,
  previousCurrentNodes,
  previousNode,
}: {
  currentGraphId: GraphId | undefined;
  graphInputRenameResult: ReturnType<typeof propagateGraphInputRename>;
  isMergedEdit: boolean | undefined;
  nextNodes: readonly ChartNode[];
  originalRename: GraphInputRename | undefined;
  params: EditNodeParams;
  previousConnections: readonly NodeConnection[];
  previousCurrentNodes: readonly ChartNode[] | undefined;
  previousNode: Partial<ChartNode>;
}): ReturnType<typeof propagateGraphInputRename> {
  if (!isMergedEdit || !currentGraphId || !originalRename) {
    return graphInputRenameResult;
  }

  const previousNodes = buildPreviousCurrentNodesForMergedEdit({
    currentNodes: nextNodes,
    editedNodeId: params.nodeId,
    previousCurrentNodes,
    previousNode,
  });
  const nextNodesFromOriginalRename = replaceNodeInGraph(previousNodes, params.nodeId, params.newNode);
  const nextCurrentGraph = getNextGraphFromOriginalRenameSnapshot(
    {
      metadata: {
        id: currentGraphId,
      },
      nodes: nextNodesFromOriginalRename,
      connections: cloneConnections(previousConnections),
    },
    originalRename,
  );

  return {
    ...graphInputRenameResult,
    nextCurrentConnections: nextCurrentGraph.connections,
    nextCurrentNodes: nextCurrentGraph.nodes,
  };
}

export function buildEditNodeAppliedData({
  params,
  currentState,
  previousNode,
  previousConnections,
  previousCurrentNodes,
  previousRecoverableConnections,
  currentRecoverableConnections,
  isMergedEdit,
  previousProjectGraphSnapshots,
  projectNodeRegistry,
}: {
  params: EditNodeParams;
  currentState: GraphCommandState;
  previousNode: Partial<ChartNode>;
  previousConnections: readonly NodeConnection[];
  previousCurrentNodes?: readonly ChartNode[];
  previousRecoverableConnections: readonly NodeConnection[];
  currentRecoverableConnections: readonly NodeConnection[];
  isMergedEdit?: boolean;
  previousProjectGraphSnapshots?: GraphInputRenameProjectGraphSnapshots;
  projectNodeRegistry: NodeRegistration<any, any>;
}): EditNodeAppliedData {
  const nextNodes = replaceNodeInGraph(currentState.nodes, params.nodeId, params.newNode);
  const { nextConnections, nextRecoverableConnections } = reconcileNodeEditConnections({
    nodeId: params.nodeId,
    newNode: params.newNode,
    nodes: currentState.nodes,
    liveConnections: currentState.connections,
    recoverableConnections: currentRecoverableConnections,
    project: currentState.project,
    referencedProjects: currentState.referencedProjects,
    projectNodeRegistry,
  });
  const graphInputRenameResult = propagateGraphInputRename({
    currentGraphId: currentState.graphId,
    editedNodeId: params.nodeId,
    nextCurrentConnections: nextConnections,
    nextCurrentNodes: nextNodes,
    previousCurrentNodes: currentState.nodes,
    project: currentState.project,
  });
  const originalRename = getOriginalGraphInputRename({
    currentGraphId: currentState.graphId,
    editedNodeId: params.nodeId,
    nextCurrentNodes: nextNodes,
    previousNode,
  });
  const effectiveGraphInputRenameResult = getMergedGraphInputRenameResult({
    currentGraphId: currentState.graphId,
    graphInputRenameResult,
    isMergedEdit,
    nextNodes,
    originalRename,
    params,
    previousConnections,
    previousCurrentNodes,
    previousNode,
  });
  const currentNodesChangedByRename =
    effectiveGraphInputRenameResult.nextCurrentNodes.length !== nextNodes.length ||
    effectiveGraphInputRenameResult.nextCurrentNodes.some((node, index) => node !== nextNodes[index]);
  const shouldSnapshotCurrentNodes = !!previousCurrentNodes || currentNodesChangedByRename;
  const projectGraphSnapshots = mergeProjectGraphSnapshots({
    currentProject: currentState.project,
    originalRename: isMergedEdit ? originalRename : undefined,
    previousSnapshots: previousProjectGraphSnapshots,
    nextSnapshots: graphInputRenameResult.projectGraphSnapshots,
  });

  return {
    previousNode: structuredClone(previousNode),
    previousConnections: cloneConnections(previousConnections),
    previousCurrentNodes: shouldSnapshotCurrentNodes
      ? cloneNodes(previousCurrentNodes ?? currentState.nodes)
      : undefined,
    nextCurrentNodes: shouldSnapshotCurrentNodes
      ? cloneNodes(effectiveGraphInputRenameResult.nextCurrentNodes)
      : undefined,
    nextConnections: cloneConnections(effectiveGraphInputRenameResult.nextCurrentConnections),
    previousRecoverableConnections: cloneConnections(previousRecoverableConnections),
    nextRecoverableConnections: cloneConnections(nextRecoverableConnections),
    projectGraphSnapshots,
  };
}

export function useEditNodeCommand() {
  const setNodes = useSetAtom(nodesState);
  const setConnections = useSetAtom(connectionsState);
  const setProject = useSetAtom(projectState);
  const setCommandHistories = useSetAtom(commandHistoryStackStatePerGraph);
  const setRecoverableNodeConnections = useSetAtom(recoverableNodeConnectionsStatePerGraph);
  const projectNodeRegistry = useProjectNodeRegistry();

  const applyNodeAndGraphState = (
    params: EditNodeParams,
    nextConnections: readonly NodeConnection[],
    nextRecoverableConnections: readonly NodeConnection[],
    currentState: GraphCommandState,
    appliedData?: EditNodeAppliedData,
  ) => {
    setNodes(appliedData?.nextCurrentNodes ?? replaceNodeInGraph(currentState.nodes, params.nodeId, params.newNode));
    setConnections(cloneConnections(nextConnections));
    if (appliedData?.projectGraphSnapshots) {
      setProject((project) =>
        getNextProjectFromGraphSnapshots(project, appliedData.projectGraphSnapshots, 'nextGraph'),
      );
    }
    setRecoverableNodeConnections((entries) =>
      setRecoverableNodeConnectionsForGraphNode(
        entries,
        currentState.graphId,
        params.nodeId,
        nextRecoverableConnections,
      ),
    );
  };

  return useCommand<EditNodeParams, EditNodeAppliedData>({
    type: 'editNode',
    apply(params, appliedData, currentState) {
      const nodeToEdit = currentState.nodes.find((node) => node.id === params.nodeId);

      if (!nodeToEdit) {
        throw new Error(`Node with id ${params.nodeId} not found`);
      }

      if (appliedData) {
        applyNodeAndGraphState(
          params,
          appliedData.nextConnections,
          appliedData.nextRecoverableConnections,
          currentState,
          appliedData,
        );
        return appliedData;
      }

      const currentRecoverableConnections = getRecoverableNodeConnectionsForNode(
        currentState.recoverableNodeConnections,
        params.nodeId,
      );
      const lastCommand = currentState.commandHistoryStack.at(-1);
      const shouldMerge = shouldMergeEditNodeCommand(lastCommand, params.nodeId);

      if (shouldMerge) {
        setCommandHistories((stacks) => removeLastCommandHistoryEntryForGraph(stacks, currentState.graphId));

        const commandToMergeWith = lastCommand!;
        const nextAppliedData = buildEditNodeAppliedData({
          params,
          currentState,
          previousNode: commandToMergeWith.appliedData.previousNode,
          previousConnections: commandToMergeWith.appliedData.previousConnections,
          previousCurrentNodes: commandToMergeWith.appliedData.previousCurrentNodes,
          previousRecoverableConnections: commandToMergeWith.appliedData.previousRecoverableConnections,
          currentRecoverableConnections,
          isMergedEdit: true,
          previousProjectGraphSnapshots: commandToMergeWith.appliedData.projectGraphSnapshots,
          projectNodeRegistry,
        });

        applyNodeAndGraphState(
          params,
          nextAppliedData.nextConnections,
          nextAppliedData.nextRecoverableConnections,
          currentState,
          nextAppliedData,
        );

        return nextAppliedData;
      }

      const nextAppliedData = buildEditNodeAppliedData({
        params,
        currentState,
        previousNode: params.previousNodeOverride ?? nodeToEdit,
        previousConnections: currentState.connections,
        previousRecoverableConnections: currentRecoverableConnections,
        currentRecoverableConnections,
        projectNodeRegistry,
      });

      applyNodeAndGraphState(
        params,
        nextAppliedData.nextConnections,
        nextAppliedData.nextRecoverableConnections,
        currentState,
        nextAppliedData,
      );

      return nextAppliedData;
    },
    undo({ nodeId }, appliedData, currentState) {
      setNodes(
        appliedData.previousCurrentNodes ??
          produce(currentState.nodes, (draft) => {
            const index = draft.findIndex((node) => node.id === nodeId);

            if (index < 0) {
              throw new Error(`Node with id ${nodeId} not found`);
            }

            draft[index] = {
              ...draft[index],
              ...structuredClone(appliedData.previousNode),
            } as ChartNode;
          }),
      );
      setConnections(cloneConnections(appliedData.previousConnections));
      if (appliedData.projectGraphSnapshots) {
        setProject((project) =>
          getNextProjectFromGraphSnapshots(project, appliedData.projectGraphSnapshots, 'previousGraph'),
        );
      }
      setRecoverableNodeConnections((entries) =>
        setRecoverableNodeConnectionsForGraphNode(
          entries,
          currentState.graphId,
          nodeId,
          appliedData.previousRecoverableConnections,
        ),
      );
    },
  });
}
