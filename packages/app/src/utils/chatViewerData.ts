import {
  arrayizeDataValue,
  isFunctionDataType,
  type ChartNode,
  type DataValue,
  type NodeGraph,
  type NodeId,
  type PortId,
  type ProcessId,
  type Project,
  type ScalarOrArrayDataValue,
} from '@rivet2/rivet-core';
import type { DataRefReader } from '../providers/ProvidersContext.js';
import type { DataValueWithRefs, NodeRunDataWithRefs, ProcessDataForNode, RunDataByNodeId } from '../state/dataFlow.js';
import { restoreStoredPortValue } from './executionDataReaders.js';

export type ChatViewerGraphEntry = {
  graph: NodeGraph;
  name: string;
};

export type ChatViewerNodeProcess = {
  node: ChartNode;
  process: ProcessDataForNode;
};

export type ChatViewerProcessRow = ChatViewerNodeProcess & {
  index: number;
};

const chatViewerNodeTypes = new Set(['chat', 'chatAnthropic', 'llmChatV2']);
const responsePort = 'response' as PortId;
const promptPort = 'prompt' as PortId;

export function getChatViewerGraphEntries(
  projectGraphs: Project['graphs'] | undefined,
  currentGraph: NodeGraph | undefined,
): ChatViewerGraphEntry[] {
  const currentGraphId = currentGraph?.metadata?.id;
  const entries = Object.values(projectGraphs ?? {})
    .filter((graph) => graph.metadata?.id !== currentGraphId)
    .map(toGraphEntry);

  if (currentGraph && shouldIncludeCurrentGraph(currentGraph)) {
    entries.push(toGraphEntry(currentGraph));
  }

  return entries;
}

export function getChatViewerNodeGraphNameMap(graphEntries: ChatViewerGraphEntry[]): Record<NodeId, string> {
  const map: Record<NodeId, string> = {};

  for (const { graph, name } of graphEntries) {
    for (const node of graph.nodes) {
      map[node.id] = name;
    }
  }

  return map;
}

export function getChatViewerChatNodes(graphEntries: ChatViewerGraphEntry[]): ChartNode[] {
  return graphEntries.flatMap(({ graph }) => graph.nodes).filter(isChatViewerNode);
}

export function getChatViewerNodeProcesses(
  chatNodes: ChartNode[],
  runDataByNode: RunDataByNodeId,
): ChatViewerNodeProcess[] {
  return chatNodes.flatMap((node) => {
    const runs = runDataByNode[node.id] ?? [];
    return runs.map((process) => ({ node, process }));
  });
}

export function getChatViewerProcessRows(processes: ChatViewerNodeProcess[]): ChatViewerProcessRow[] {
  return processes.flatMap((nodeProcess) => {
    const splitOutputData = nodeProcess.process.data.splitOutputData;

    if (splitOutputData) {
      const rows = Object.keys(splitOutputData)
        .map(Number)
        .sort((left, right) => left - right)
        .map((index) => createChatViewerProcessRow(nodeProcess, index))
        .filter(hasChatViewerResponse);

      if (rows.length > 0) {
        return rows;
      }
    }

    const row = createChatViewerProcessRow(nodeProcess, -1);
    return hasRenderableChatViewerOutput(row) ? [row] : [];
  });
}

export function hasChatViewerRows(
  projectGraphs: Project['graphs'] | undefined,
  currentGraph: NodeGraph | undefined,
  runDataByNode: RunDataByNodeId,
): boolean {
  const graphEntries = getChatViewerGraphEntries(projectGraphs, currentGraph);
  const chatNodes = getChatViewerChatNodes(graphEntries);
  const processes = getChatViewerNodeProcesses(chatNodes, runDataByNode);
  return getChatViewerProcessRows(processes).length > 0;
}

export function getChatViewerResponseValue(
  data: NodeRunDataWithRefs,
  splitIndex: number,
): DataValueWithRefs | undefined {
  const outputData = splitIndex === -1 ? data.outputData : data.splitOutputData?.[splitIndex];
  return outputData?.[responsePort];
}

export function getChatViewerPromptValue(
  data: NodeRunDataWithRefs,
  splitIndex: number,
  dataRefs: DataRefReader,
): DataValueWithRefs | DataValue | undefined {
  const promptValue = data.inputData?.[promptPort];
  if (!promptValue) {
    return undefined;
  }

  if (splitIndex === -1) {
    return promptValue;
  }

  const restoredPromptValue = restoreStoredPortValue(data.inputData, promptPort, dataRefs);
  if (!restoredPromptValue || isFunctionDataType(restoredPromptValue.type)) {
    return promptValue;
  }

  const values = arrayizeDataValue(restoredPromptValue as ScalarOrArrayDataValue);
  return values[splitIndex] ?? values[0] ?? promptValue;
}

export function getChatViewerErrorValue(data: NodeRunDataWithRefs): DataValue | undefined {
  if (data.status?.type !== 'error') {
    return undefined;
  }

  return {
    type: 'string',
    value: data.status.error,
  };
}

export function getChatViewerProcessKey(nodeId: NodeId, processId: ProcessId, splitIndex: number): string {
  return `${nodeId}-${processId}-${splitIndex}`;
}

function isChatViewerNode(node: ChartNode): boolean {
  return chatViewerNodeTypes.has(node.type);
}

function createChatViewerProcessRow(nodeProcess: ChatViewerNodeProcess, index: number): ChatViewerProcessRow {
  return {
    ...nodeProcess,
    index,
  };
}

function hasChatViewerResponse(row: ChatViewerProcessRow): boolean {
  return getChatViewerResponseValue(row.process.data, row.index) != null;
}

function hasRenderableChatViewerOutput(row: ChatViewerProcessRow): boolean {
  return hasChatViewerResponse(row) || row.process.data.status?.type === 'error';
}

function shouldIncludeCurrentGraph(graph: NodeGraph): boolean {
  return graph.metadata?.id != null || graph.nodes.length > 0 || graph.connections.length > 0;
}

function toGraphEntry(graph: NodeGraph): ChatViewerGraphEntry {
  return {
    graph,
    name: graph.metadata?.name ?? 'Unknown Graph',
  };
}
