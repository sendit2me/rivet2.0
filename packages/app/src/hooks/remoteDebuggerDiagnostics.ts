import type {
  GraphRunId,
  NodeId,
  ProcessEventMessageMap,
  ProcessId,
  ProjectId,
  RemoteRunRequestId,
  RootRunId,
} from '@valerypopoff/rivet2-core';
import type { MissingDebuggerTerminalEvent } from './graphExecutionEventHelpers.js';
import type {
  RemoteExecutionEventDispatchDecision,
  UnscopedRemoteExecutionRoutingState,
} from './remoteExecutorRunRequest.js';

const DEFAULT_MAX_TRACE_ENTRIES = 500;
const DEFAULT_MAX_PROCESS_LIFECYCLE_ENTRIES = 5000;
const MAX_MISSING_PROCESS_TRACE_ENTRIES = 80;
const MAX_ROOT_RUN_TRACE_ENTRIES = 120;

type DiagnosticsConsole = Pick<Console, 'groupCollapsed' | 'groupEnd' | 'log' | 'table' | 'warn'>;

export type RemoteDebuggerTraceEntry = {
  activeRequestId: RemoteRunRequestId | null;
  currentProjectId: ProjectId | undefined;
  decision: RemoteExecutionEventDispatchDecision;
  event: RemoteDebuggerEventSummary;
  message: keyof ProcessEventMessageMap;
  requestId: RemoteRunRequestId | undefined;
  routingAfter: RemoteDebuggerRoutingSummary;
  routingBefore: RemoteDebuggerRoutingSummary;
  sequence: number;
  session: {
    status: string;
    targetType: string;
    url?: string;
  };
  timestamp: string;
};

export type RemoteDebuggerEventSummary = {
  graphId?: string;
  graphRunId?: GraphRunId;
  inputPorts?: string[];
  nodeId?: NodeId;
  nodeType?: string;
  outputPorts?: string[];
  parentGraphRunId?: GraphRunId;
  processId?: ProcessId;
  projectId?: ProjectId;
  rootRunId?: RootRunId;
  splitIndex?: number;
};

export type RemoteDebuggerRoutingSummary = {
  acceptedRootRunIds: RootRunId[];
  completedRootRunDecisions: Array<{ accepted: boolean; rootRunId: RootRunId }>;
  ignoredRootRunIds: RootRunId[];
  lastRunAccepted: boolean | undefined;
  recentlyCompletedRootRunDecisions: Array<{ accepted: boolean; rootRunId: RootRunId }>;
};

export type RemoteDebuggerDiagnostics = {
  logMissingTerminalEvent: (event: MissingDebuggerTerminalEvent) => void;
  recordEvent: (entry: Omit<RemoteDebuggerTraceEntry, 'sequence' | 'timestamp'>) => void;
  reset: () => void;
};

export function createRemoteDebuggerDiagnostics(options: {
  console?: DiagnosticsConsole;
  maxProcessLifecycleEntries?: number;
  maxTraceEntries?: number;
  now?: () => Date;
} = {}): RemoteDebuggerDiagnostics {
  const traceEntries: RemoteDebuggerTraceEntry[] = [];
  const diagnosticsConsole = options.console ?? console;
  const maxProcessLifecycleEntries = options.maxProcessLifecycleEntries ?? DEFAULT_MAX_PROCESS_LIFECYCLE_ENTRIES;
  const maxTraceEntries = options.maxTraceEntries ?? DEFAULT_MAX_TRACE_ENTRIES;
  const now = options.now ?? (() => new Date());
  const processLifecycles = new Map<string, RemoteDebuggerProcessLifecycleSummary>();
  let nextSequence = 1;

  return {
    logMissingTerminalEvent: (event) => {
      const recentTrace = traceEntries.slice(-maxTraceEntries);
      const matchingProcessTrace = filterTraceForMissingProcess(recentTrace, event).slice(
        -MAX_MISSING_PROCESS_TRACE_ENTRIES,
      );
      const rootRunTrace = event.rootRunId
        ? recentTrace.filter((entry) => entry.event.rootRunId === event.rootRunId).slice(-MAX_ROOT_RUN_TRACE_ENTRIES)
        : [];
      const lifecycleSummaries = findProcessLifecycleSummaries(processLifecycles, event);
      const heading = '[Remote Debugger diagnostics] Missing node terminal event';

      diagnosticsConsole.groupCollapsed?.(heading, event);
      diagnosticsConsole.warn(heading, {
        diagnosisHints: buildDiagnosisHints({
          lifecycleSummaries,
          matchingProcessTrace,
          rootRunTrace,
        }),
        event,
        matchingProcessTraceEntryCount: matchingProcessTrace.length,
        processLifecycleSummaryCount: lifecycleSummaries.length,
        processLifecycleSummaryLimit: maxProcessLifecycleEntries,
        recentTraceEntryCount: recentTrace.length,
        rootRunTraceEntryCount: rootRunTrace.length,
        triggerStack: getTriggerStack(heading),
      });
      diagnosticsConsole.table?.(lifecycleSummaries.map(formatProcessLifecycleForTable));
      diagnosticsConsole.table?.(matchingProcessTrace.map(formatTraceEntryForTable));
      diagnosticsConsole.table?.(rootRunTrace.map(formatTraceEntryForTable));
      diagnosticsConsole.table?.(recentTrace.map(formatTraceEntryForTable));
      diagnosticsConsole.log('Matching process trace entries', matchingProcessTrace);
      diagnosticsConsole.log('Matching root run trace entries', rootRunTrace);
      diagnosticsConsole.log('Remote Debugger process lifecycle summaries', lifecycleSummaries);
      diagnosticsConsole.log('Recent Remote Debugger trace entries', recentTrace);
      diagnosticsConsole.groupEnd?.();
    },
    recordEvent: (entry) => {
      const traceEntry: RemoteDebuggerTraceEntry = {
        ...entry,
        sequence: nextSequence++,
        timestamp: now().toISOString(),
      };
      traceEntries.push(traceEntry);
      updateProcessLifecycleSummaries(processLifecycles, traceEntry, maxProcessLifecycleEntries);

      if (traceEntries.length > maxTraceEntries) {
        traceEntries.splice(0, traceEntries.length - maxTraceEntries);
      }
    },
    reset: () => {
      traceEntries.length = 0;
      processLifecycles.clear();
      nextSequence = 1;
    },
  };
}

export function summarizeRemoteDebuggerEvent<K extends keyof ProcessEventMessageMap>(
  message: K,
  data: ProcessEventMessageMap[K],
): RemoteDebuggerEventSummary {
  const record = isRecord(data) ? data : undefined;
  const execution = isRecord(record?.execution) ? record.execution : undefined;
  const node = isRecord(record?.node) ? record.node : undefined;
  const project = isRecord(record?.project) ? record.project : undefined;
  const projectMetadata = isRecord(project?.metadata) ? project.metadata : undefined;

  return {
    graphId: readString(record?.graphId) ?? readString(execution?.graphId),
    graphRunId: readString(execution?.graphRunId) as GraphRunId | undefined,
    inputPorts: summarizePortIds(record?.inputs),
    nodeId: readString(node?.id) as NodeId | undefined,
    nodeType: readString(node?.type),
    outputPorts: summarizePortIds(record?.outputs),
    parentGraphRunId: readString(execution?.parentGraphRunId) as GraphRunId | undefined,
    processId: readString(record?.processId) as ProcessId | undefined,
    projectId: readString(projectMetadata?.id) as ProjectId | undefined,
    rootRunId: readString(execution?.rootRunId) as RootRunId | undefined,
    splitIndex: typeof record?.index === 'number' ? record.index : undefined,
  };
}

export function summarizeRemoteDebuggerRoutingState(
  state: UnscopedRemoteExecutionRoutingState,
): RemoteDebuggerRoutingSummary {
  return {
    acceptedRootRunIds: [...state.acceptedRootRunIds],
    completedRootRunDecisions: state.completedRootRunDecisions.map((decision) => ({ ...decision })),
    ignoredRootRunIds: [...state.ignoredRootRunIds],
    lastRunAccepted: state.lastRunAccepted,
    recentlyCompletedRootRunDecisions: [...state.recentlyCompletedRootRunDecisions.entries()].map(
      ([rootRunId, accepted]) => ({ accepted, rootRunId }),
    ),
  };
}

function formatTraceEntryForTable(entry: RemoteDebuggerTraceEntry) {
  return {
    seq: entry.sequence,
    time: entry.timestamp,
    message: entry.message,
    dispatch: entry.decision.shouldDispatch,
    reason: entry.decision.reason,
    projectId: entry.event.projectId ?? entry.currentProjectId ?? '',
    rootRunId: entry.event.rootRunId ?? entry.decision.rootRunId ?? '',
    graphId: entry.event.graphId ?? '',
    graphRunId: entry.event.graphRunId ?? '',
    parentGraphRunId: entry.event.parentGraphRunId ?? '',
    nodeId: entry.event.nodeId ?? '',
    nodeType: entry.event.nodeType ?? '',
    processId: entry.event.processId ?? '',
    splitIndex: entry.event.splitIndex ?? '',
    requestId: entry.requestId ?? '',
    activeRequestId: entry.activeRequestId ?? '',
    targetType: entry.session.targetType,
  };
}

type RemoteDebuggerProcessLifecycleSummary = {
  dispatchedTerminalMessages: Array<keyof ProcessEventMessageMap>;
  firstSeenAt: string;
  graphRunId?: GraphRunId;
  inputPorts: string[];
  lastDecisionReason: RemoteExecutionEventDispatchDecision['reason'];
  lastSeenAt: string;
  lastSequence: number;
  messages: Array<keyof ProcessEventMessageMap>;
  nodeId: NodeId;
  nodeType?: string;
  outputPorts: string[];
  parentGraphRunId?: GraphRunId;
  processId: ProcessId;
  receivedTerminalMessages: Array<keyof ProcessEventMessageMap>;
  rootRunId?: RootRunId;
};

function updateProcessLifecycleSummaries(
  processLifecycles: Map<string, RemoteDebuggerProcessLifecycleSummary>,
  entry: RemoteDebuggerTraceEntry,
  maxProcessLifecycleEntries: number,
): void {
  if (!entry.event.nodeId || !entry.event.processId) {
    return;
  }

  const key = getProcessLifecycleKey(entry.event);
  const existing = processLifecycles.get(key);
  const summary: RemoteDebuggerProcessLifecycleSummary =
    existing ??
    {
      dispatchedTerminalMessages: [],
      firstSeenAt: entry.timestamp,
      graphRunId: entry.event.graphRunId,
      inputPorts: [],
      lastDecisionReason: entry.decision.reason,
      lastSeenAt: entry.timestamp,
      lastSequence: entry.sequence,
      messages: [],
      nodeId: entry.event.nodeId,
      nodeType: entry.event.nodeType,
      outputPorts: [],
      parentGraphRunId: entry.event.parentGraphRunId,
      processId: entry.event.processId,
      receivedTerminalMessages: [],
      rootRunId: entry.event.rootRunId,
    };

  appendUnique(summary.messages, entry.message);
  appendPorts(summary.inputPorts, entry.event.inputPorts);
  appendPorts(summary.outputPorts, entry.event.outputPorts);

  if (isNodeTerminalMessage(entry.message)) {
    appendUnique(summary.receivedTerminalMessages, entry.message);
    if (entry.decision.shouldDispatch) {
      appendUnique(summary.dispatchedTerminalMessages, entry.message);
    }
  }

  summary.graphRunId = summary.graphRunId ?? entry.event.graphRunId;
  summary.lastDecisionReason = entry.decision.reason;
  summary.lastSeenAt = entry.timestamp;
  summary.lastSequence = entry.sequence;
  summary.nodeType = summary.nodeType ?? entry.event.nodeType;
  summary.outputPorts = summary.outputPorts.slice(0, 20);
  summary.parentGraphRunId = summary.parentGraphRunId ?? entry.event.parentGraphRunId;
  summary.rootRunId = summary.rootRunId ?? entry.event.rootRunId;
  if (existing) {
    processLifecycles.delete(key);
  }
  processLifecycles.set(key, summary);

  while (processLifecycles.size > maxProcessLifecycleEntries) {
    const oldestKey = processLifecycles.keys().next();
    if (oldestKey.done) {
      return;
    }
    processLifecycles.delete(oldestKey.value);
  }
}

function filterTraceForMissingProcess(
  traceEntries: RemoteDebuggerTraceEntry[],
  event: MissingDebuggerTerminalEvent,
): RemoteDebuggerTraceEntry[] {
  return traceEntries.filter((entry) => {
    const sameProcess = entry.event.processId === event.processId;
    const sameNode = entry.event.nodeId === event.nodeId;
    const sameRoot =
      event.rootRunId == null || entry.event.rootRunId == null || entry.event.rootRunId === event.rootRunId;
    const sameGraphRun =
      event.graphRunId == null || entry.event.graphRunId == null || entry.event.graphRunId === event.graphRunId;
    return sameProcess && sameNode && sameRoot && sameGraphRun;
  });
}

function findProcessLifecycleSummaries(
  processLifecycles: Map<string, RemoteDebuggerProcessLifecycleSummary>,
  event: MissingDebuggerTerminalEvent,
): RemoteDebuggerProcessLifecycleSummary[] {
  return [...processLifecycles.values()].filter((summary) => {
    const sameProcess = summary.processId === event.processId;
    const sameNode = summary.nodeId === event.nodeId;
    const sameRoot =
      event.rootRunId == null || summary.rootRunId == null || summary.rootRunId === event.rootRunId;
    const sameGraphRun =
      event.graphRunId == null || summary.graphRunId == null || summary.graphRunId === event.graphRunId;
    return sameProcess && sameNode && sameRoot && sameGraphRun;
  });
}

function buildDiagnosisHints(options: {
  lifecycleSummaries: RemoteDebuggerProcessLifecycleSummary[];
  matchingProcessTrace: RemoteDebuggerTraceEntry[];
  rootRunTrace: RemoteDebuggerTraceEntry[];
}): string[] {
  const hints: string[] = [];
  const sawTerminal = options.lifecycleSummaries.some((summary) => summary.receivedTerminalMessages.length > 0);
  const dispatchedTerminal = options.lifecycleSummaries.some(
    (summary) => summary.dispatchedTerminalMessages.length > 0,
  );

  if (options.lifecycleSummaries.length === 0) {
    hints.push('No lifecycle summary was retained for this process; inspect the recent/root trace and server logs.');
  } else if (!sawTerminal) {
    hints.push('No nodeFinish/nodeError/nodeExcluded was observed for this process in the app websocket stream.');
  } else if (!dispatchedTerminal) {
    hints.push('A terminal node event was observed for this process, but routing rejected it.');
  } else {
    hints.push('A terminal node event was observed and dispatched; inspect state merge/display handling next.');
  }

  if (options.matchingProcessTrace.length === 0) {
    hints.push('The recent bounded trace no longer contains this exact process; use the lifecycle summary first.');
  }

  if (options.rootRunTrace.length === 0) {
    hints.push('No recent trace entries matched this rootRunId; check whether the missing process has root metadata.');
  }

  return hints;
}

function formatProcessLifecycleForTable(summary: RemoteDebuggerProcessLifecycleSummary) {
  return {
    processId: summary.processId,
    nodeId: summary.nodeId,
    nodeType: summary.nodeType ?? '',
    rootRunId: summary.rootRunId ?? '',
    graphRunId: summary.graphRunId ?? '',
    parentGraphRunId: summary.parentGraphRunId ?? '',
    firstSeenAt: summary.firstSeenAt,
    lastSeenAt: summary.lastSeenAt,
    lastSequence: summary.lastSequence,
    messages: summary.messages.join(', '),
    receivedTerminal: summary.receivedTerminalMessages.join(', '),
    dispatchedTerminal: summary.dispatchedTerminalMessages.join(', '),
    lastDecisionReason: summary.lastDecisionReason,
    inputPorts: summary.inputPorts.join(', '),
    outputPorts: summary.outputPorts.join(', '),
  };
}

function getProcessLifecycleKey(event: RemoteDebuggerEventSummary): string {
  return [event.rootRunId ?? '', event.graphRunId ?? '', event.nodeId ?? '', event.processId ?? ''].join(':');
}

function isNodeTerminalMessage(message: keyof ProcessEventMessageMap): boolean {
  return message === 'nodeFinish' || message === 'nodeError' || message === 'nodeExcluded';
}

function appendPorts(target: string[], ports: string[] | undefined): void {
  if (!ports) {
    return;
  }

  for (const port of ports) {
    appendUnique(target, port);
  }
}

function appendUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function summarizePortIds(value: unknown): string[] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.keys(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function getTriggerStack(message: string): string | undefined {
  try {
    return new Error(message).stack;
  } catch {
    return undefined;
  }
}
