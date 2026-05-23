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
const MAX_VISIBLE_RECENT_TRACE_ROWS = 40;

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
  error?: string;
  graphId?: string;
  graphRunId?: GraphRunId;
  inputPorts?: string[];
  nodeId?: NodeId;
  nodeExcludedReason?: string;
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

type FormattedProcessLifecycle = ReturnType<typeof formatProcessLifecycleForTable>;
type FormattedTraceEntry = ReturnType<typeof formatTraceEntryForTable>;

type MissingTerminalDiagnosticDetails = {
  diagnosisHints: string[];
  event: MissingDebuggerTerminalEvent;
  lifecycleSummaries: FormattedProcessLifecycle[];
  matchingProcessTrace: FormattedTraceEntry[];
  processLifecycleSummaryLimit: number;
  recentTraceEntryCount: number;
  recentTraceTail: FormattedTraceEntry[];
  relatedLifecycleSummaries: FormattedProcessLifecycle[];
  relatedProcessTrace: FormattedTraceEntry[];
  rootRunTrace: FormattedTraceEntry[];
  triggerStack: string | undefined;
};

type UnexpectedAbortNodeErrorDiagnosticDetails = {
  diagnosisHints: string[];
  event: RemoteDebuggerEventSummary;
  lifecycleSummaries: FormattedProcessLifecycle[];
  matchingProcessTrace: FormattedTraceEntry[];
  recentTraceEntryCount: number;
  recentTraceTail: FormattedTraceEntry[];
  relatedLifecycleSummaries: FormattedProcessLifecycle[];
  relatedProcessTrace: FormattedTraceEntry[];
  rootRunTrace: FormattedTraceEntry[];
  triggerStack: string | undefined;
};

type NodeExcludedDiagnosticDetails = {
  diagnosisHints: string[];
  event: RemoteDebuggerEventSummary;
  lifecycleSummaries: FormattedProcessLifecycle[];
  matchingProcessTrace: FormattedTraceEntry[];
  recentTraceEntryCount: number;
  recentTraceTail: FormattedTraceEntry[];
  relatedLifecycleSummaries: FormattedProcessLifecycle[];
  relatedProcessTrace: FormattedTraceEntry[];
  rootRunTrace: FormattedTraceEntry[];
  triggerStack: string | undefined;
};

export type RemoteDebuggerDiagnostics = {
  logMissingTerminalEvent: (event: MissingDebuggerTerminalEvent) => void;
  logNodeExcluded: (event: RemoteDebuggerEventSummary) => void;
  logUnexpectedAbortNodeError: (event: RemoteDebuggerEventSummary) => void;
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
      const relatedProcessTrace = filterTraceForRelatedProcess(recentTrace, event).slice(
        -MAX_MISSING_PROCESS_TRACE_ENTRIES,
      );
      const relatedLifecycleSummaries = findRelatedProcessLifecycleSummaries(processLifecycles, event);
      const recentTraceTail = recentTrace.slice(-MAX_VISIBLE_RECENT_TRACE_ROWS);
      const heading = '[Remote Debugger diagnostics] Missing node terminal event';
      const diagnosticDetails: MissingTerminalDiagnosticDetails = {
        diagnosisHints: buildDiagnosisHints({
          lifecycleSummaries,
          matchingProcessTrace,
          relatedLifecycleSummaries,
          rootRunTrace,
        }),
        event,
        lifecycleSummaries: lifecycleSummaries.map(formatProcessLifecycleForTable),
        matchingProcessTrace: matchingProcessTrace.map(formatTraceEntryForTable),
        processLifecycleSummaryLimit: maxProcessLifecycleEntries,
        recentTraceEntryCount: recentTrace.length,
        recentTraceTail: recentTraceTail.map(formatTraceEntryForTable),
        relatedLifecycleSummaries: relatedLifecycleSummaries.map(formatProcessLifecycleForTable),
        relatedProcessTrace: relatedProcessTrace.map(formatTraceEntryForTable),
        rootRunTrace: rootRunTrace.map(formatTraceEntryForTable),
        triggerStack: getTriggerStack(heading),
      };

      diagnosticsConsole.warn(
        `${heading}\n${formatMissingTerminalDiagnosticReport(diagnosticDetails)}`,
        diagnosticDetails,
      );
      diagnosticsConsole.groupCollapsed?.(`${heading} details`, event);
      diagnosticsConsole.log('Remote Debugger diagnostic details', diagnosticDetails);
      diagnosticsConsole.table?.(diagnosticDetails.lifecycleSummaries);
      diagnosticsConsole.table?.(diagnosticDetails.matchingProcessTrace);
      diagnosticsConsole.table?.(diagnosticDetails.relatedProcessTrace);
      diagnosticsConsole.table?.(diagnosticDetails.rootRunTrace);
      diagnosticsConsole.table?.(diagnosticDetails.recentTraceTail);
      diagnosticsConsole.log('Matching process trace entries', matchingProcessTrace);
      diagnosticsConsole.log('Related same-node/process trace entries', relatedProcessTrace);
      diagnosticsConsole.log('Matching root run trace entries', rootRunTrace);
      diagnosticsConsole.log('Remote Debugger process lifecycle summaries', lifecycleSummaries);
      diagnosticsConsole.log('Recent Remote Debugger trace tail', recentTraceTail);
      diagnosticsConsole.groupEnd?.();
    },
    logNodeExcluded: (event) => {
      const recentTrace = traceEntries.slice(-maxTraceEntries);
      const matchingProcessTrace = filterTraceForProcess(recentTrace, event).slice(-MAX_MISSING_PROCESS_TRACE_ENTRIES);
      const rootRunTrace = event.rootRunId
        ? recentTrace.filter((entry) => entry.event.rootRunId === event.rootRunId).slice(-MAX_ROOT_RUN_TRACE_ENTRIES)
        : [];
      const relatedProcessTrace = filterTraceForRelatedProcess(recentTrace, event).slice(
        -MAX_MISSING_PROCESS_TRACE_ENTRIES,
      );
      const lifecycleSummaries = findProcessLifecycleSummaries(processLifecycles, event);
      const relatedLifecycleSummaries = findRelatedProcessLifecycleSummaries(processLifecycles, event);
      const recentTraceTail = recentTrace.slice(-MAX_VISIBLE_RECENT_TRACE_ROWS);
      const heading = '[Remote Debugger diagnostics] Node excluded';
      const diagnosticDetails: NodeExcludedDiagnosticDetails = {
        diagnosisHints: buildNodeExcludedDiagnosisHints(event),
        event,
        lifecycleSummaries: lifecycleSummaries.map(formatProcessLifecycleForTable),
        matchingProcessTrace: matchingProcessTrace.map(formatTraceEntryForTable),
        recentTraceEntryCount: recentTrace.length,
        recentTraceTail: recentTraceTail.map(formatTraceEntryForTable),
        relatedLifecycleSummaries: relatedLifecycleSummaries.map(formatProcessLifecycleForTable),
        relatedProcessTrace: relatedProcessTrace.map(formatTraceEntryForTable),
        rootRunTrace: rootRunTrace.map(formatTraceEntryForTable),
        triggerStack: getTriggerStack(heading),
      };

      diagnosticsConsole.warn(`${heading}\n${formatNodeExcludedDiagnosticReport(diagnosticDetails)}`, diagnosticDetails);
      diagnosticsConsole.groupCollapsed?.(`${heading} details`, event);
      diagnosticsConsole.log('Remote Debugger nodeExcluded diagnostic details', diagnosticDetails);
      diagnosticsConsole.table?.(diagnosticDetails.lifecycleSummaries);
      diagnosticsConsole.table?.(diagnosticDetails.matchingProcessTrace);
      diagnosticsConsole.table?.(diagnosticDetails.relatedProcessTrace);
      diagnosticsConsole.table?.(diagnosticDetails.rootRunTrace);
      diagnosticsConsole.table?.(diagnosticDetails.recentTraceTail);
      diagnosticsConsole.log('Matching process trace entries', matchingProcessTrace);
      diagnosticsConsole.log('Related same-node/process trace entries', relatedProcessTrace);
      diagnosticsConsole.log('Matching root run trace entries', rootRunTrace);
      diagnosticsConsole.log('Remote Debugger process lifecycle summaries', lifecycleSummaries);
      diagnosticsConsole.log('Recent Remote Debugger trace tail', recentTraceTail);
      diagnosticsConsole.groupEnd?.();
    },
    logUnexpectedAbortNodeError: (event) => {
      const recentTrace = traceEntries.slice(-maxTraceEntries);
      const matchingProcessTrace = filterTraceForProcess(recentTrace, event).slice(-MAX_MISSING_PROCESS_TRACE_ENTRIES);
      const rootRunTrace = event.rootRunId
        ? recentTrace.filter((entry) => entry.event.rootRunId === event.rootRunId).slice(-MAX_ROOT_RUN_TRACE_ENTRIES)
        : [];
      const relatedProcessTrace = filterTraceForRelatedProcess(recentTrace, event).slice(
        -MAX_MISSING_PROCESS_TRACE_ENTRIES,
      );
      const lifecycleSummaries = findProcessLifecycleSummaries(processLifecycles, event);
      const relatedLifecycleSummaries = findRelatedProcessLifecycleSummaries(processLifecycles, event);
      const recentTraceTail = recentTrace.slice(-MAX_VISIBLE_RECENT_TRACE_ROWS);
      const heading = '[Remote Debugger diagnostics] Unexpected aborted node error';
      const diagnosticDetails: UnexpectedAbortNodeErrorDiagnosticDetails = {
        diagnosisHints: [
          'A nodeError with an abort-like message was observed and dispatched. This is not websocket event loss; inspect successful/error abort propagation and parent graph terminal events.',
          'If this node should have finished normally, compare its graphRunId/parentGraphRunId against nearby graphAbort, graphFinish, and done events.',
        ],
        event,
        lifecycleSummaries: lifecycleSummaries.map(formatProcessLifecycleForTable),
        matchingProcessTrace: matchingProcessTrace.map(formatTraceEntryForTable),
        recentTraceEntryCount: recentTrace.length,
        recentTraceTail: recentTraceTail.map(formatTraceEntryForTable),
        relatedLifecycleSummaries: relatedLifecycleSummaries.map(formatProcessLifecycleForTable),
        relatedProcessTrace: relatedProcessTrace.map(formatTraceEntryForTable),
        rootRunTrace: rootRunTrace.map(formatTraceEntryForTable),
        triggerStack: getTriggerStack(heading),
      };

      diagnosticsConsole.warn(
        `${heading}\n${formatUnexpectedAbortNodeErrorReport(diagnosticDetails)}`,
        diagnosticDetails,
      );
      diagnosticsConsole.groupCollapsed?.(`${heading} details`, event);
      diagnosticsConsole.log('Remote Debugger abort diagnostic details', diagnosticDetails);
      diagnosticsConsole.table?.(diagnosticDetails.lifecycleSummaries);
      diagnosticsConsole.table?.(diagnosticDetails.matchingProcessTrace);
      diagnosticsConsole.table?.(diagnosticDetails.relatedProcessTrace);
      diagnosticsConsole.table?.(diagnosticDetails.rootRunTrace);
      diagnosticsConsole.table?.(diagnosticDetails.recentTraceTail);
      diagnosticsConsole.log('Matching process trace entries', matchingProcessTrace);
      diagnosticsConsole.log('Related same-node/process trace entries', relatedProcessTrace);
      diagnosticsConsole.log('Matching root run trace entries', rootRunTrace);
      diagnosticsConsole.log('Remote Debugger process lifecycle summaries', lifecycleSummaries);
      diagnosticsConsole.log('Recent Remote Debugger trace tail', recentTraceTail);
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
  const error = record?.error === undefined ? undefined : formatErrorSummary(record.error);
  const nodeExcludedReason = readString(record?.reason);

  return {
    ...(error === undefined ? {} : { error }),
    graphId: readString(record?.graphId) ?? readString(execution?.graphId),
    graphRunId: readString(execution?.graphRunId) as GraphRunId | undefined,
    inputPorts: summarizePortIds(record?.inputs),
    nodeId: readString(node?.id) as NodeId | undefined,
    ...(nodeExcludedReason === undefined ? {} : { nodeExcludedReason }),
    nodeType: readString(node?.type),
    outputPorts: summarizePortIds(record?.outputs),
    parentGraphRunId: readString(execution?.parentGraphRunId) as GraphRunId | undefined,
    processId: readString(record?.processId) as ProcessId | undefined,
    projectId: readString(projectMetadata?.id) as ProjectId | undefined,
    rootRunId: readString(execution?.rootRunId) as RootRunId | undefined,
    splitIndex: typeof record?.index === 'number' ? record.index : undefined,
  };
}

export function isAbortLikeRemoteDebuggerNodeError(data: unknown): boolean {
  const record = isRecord(data) ? data : undefined;
  return isAbortLikeErrorMessage(formatErrorSummary(record?.error));
}

export function shouldLogRemoteDebuggerNodeExcluded(data: unknown): boolean {
  const record = isRecord(data) ? data : undefined;
  const node = isRecord(record?.node) ? record.node : undefined;
  const nodeType = readString(node?.type) ?? readString(record?.nodeType);
  const reason = readString(record?.reason) ?? readString(record?.nodeExcludedReason);

  return (
    reason === 'Graph aborted successfully' ||
    reason === 'Race branch lost' ||
    reason === 'input is excluded value' ||
    nodeType === 'expression' ||
    nodeType === 'code' ||
    nodeType === 'codeNew' ||
    nodeType === 'subGraph'
  );
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
    error: entry.event.error ?? '',
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
    nodeExcludedReason: entry.event.nodeExcludedReason ?? '',
    nodeType: entry.event.nodeType ?? '',
    processId: entry.event.processId ?? '',
    splitIndex: entry.event.splitIndex ?? '',
    inputPorts: entry.event.inputPorts?.join(', ') ?? '',
    outputPorts: entry.event.outputPorts?.join(', ') ?? '',
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

function filterTraceForProcess(
  traceEntries: RemoteDebuggerTraceEntry[],
  event: ProcessDiagnosticLookup,
): RemoteDebuggerTraceEntry[] {
  if (!hasProcessIdentity(event)) {
    return [];
  }

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

function filterTraceForMissingProcess(
  traceEntries: RemoteDebuggerTraceEntry[],
  event: MissingDebuggerTerminalEvent,
): RemoteDebuggerTraceEntry[] {
  return filterTraceForProcess(traceEntries, event);
}

function filterTraceForRelatedProcess(
  traceEntries: RemoteDebuggerTraceEntry[],
  event: ProcessDiagnosticLookup,
): RemoteDebuggerTraceEntry[] {
  if (!hasProcessIdentity(event)) {
    return [];
  }

  return traceEntries.filter((entry) => entry.event.processId === event.processId && entry.event.nodeId === event.nodeId);
}

function findProcessLifecycleSummaries(
  processLifecycles: Map<string, RemoteDebuggerProcessLifecycleSummary>,
  event: ProcessDiagnosticLookup,
): RemoteDebuggerProcessLifecycleSummary[] {
  if (!hasProcessIdentity(event)) {
    return [];
  }

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

function findRelatedProcessLifecycleSummaries(
  processLifecycles: Map<string, RemoteDebuggerProcessLifecycleSummary>,
  event: ProcessDiagnosticLookup,
): RemoteDebuggerProcessLifecycleSummary[] {
  if (!hasProcessIdentity(event)) {
    return [];
  }

  return [...processLifecycles.values()].filter(
    (summary) => summary.processId === event.processId && summary.nodeId === event.nodeId,
  );
}

type ProcessDiagnosticLookup = {
  error?: string;
  graphRunId?: GraphRunId;
  nodeId?: NodeId;
  processId?: ProcessId;
  rootRunId?: RootRunId;
};

function hasProcessIdentity(event: ProcessDiagnosticLookup): event is ProcessDiagnosticLookup & {
  nodeId: NodeId;
  processId: ProcessId;
} {
  return event.nodeId !== undefined && event.processId !== undefined;
}

function buildDiagnosisHints(options: {
  lifecycleSummaries: RemoteDebuggerProcessLifecycleSummary[];
  matchingProcessTrace: RemoteDebuggerTraceEntry[];
  relatedLifecycleSummaries: RemoteDebuggerProcessLifecycleSummary[];
  rootRunTrace: RemoteDebuggerTraceEntry[];
}): string[] {
  const hints: string[] = [];
  const sawTerminal = options.lifecycleSummaries.some((summary) => summary.receivedTerminalMessages.length > 0);
  const dispatchedTerminal = options.lifecycleSummaries.some(
    (summary) => summary.dispatchedTerminalMessages.length > 0,
  );
  const sawRelatedTerminal = options.relatedLifecycleSummaries.some(
    (summary) => summary.receivedTerminalMessages.length > 0,
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

  if (!sawTerminal && sawRelatedTerminal) {
    hints.push(
      'A terminal event was observed for the same node/process under different root or graph metadata; inspect nested graph-run routing metadata.',
    );
  }

  if (options.matchingProcessTrace.length === 0) {
    hints.push('The recent bounded trace no longer contains this exact process; use the lifecycle summary first.');
  }

  if (options.rootRunTrace.length === 0) {
    hints.push('No recent trace entries matched this rootRunId; check whether the missing process has root metadata.');
  }

  return hints;
}

function formatMissingTerminalDiagnosticReport(details: MissingTerminalDiagnosticDetails): string {
  return [
    `event: ${formatMissingEvent(details.event)}`,
    `hints: ${details.diagnosisHints.join(' | ')}`,
    `counts: exactLifecycle=${details.lifecycleSummaries.length}, relatedLifecycle=${details.relatedLifecycleSummaries.length}, exactProcessTrace=${details.matchingProcessTrace.length}, relatedProcessTrace=${details.relatedProcessTrace.length}, rootRunTrace=${details.rootRunTrace.length}, recentTrace=${details.recentTraceEntryCount}, lifecycleLimit=${details.processLifecycleSummaryLimit}`,
    formatRowsForReport('exact lifecycle', details.lifecycleSummaries, formatLifecycleReportRow),
    formatRowsForReport('related same-node/process lifecycle', details.relatedLifecycleSummaries, formatLifecycleReportRow),
    formatRowsForReport('exact process trace', details.matchingProcessTrace, formatTraceReportRow),
    formatRowsForReport('related same-node/process trace', details.relatedProcessTrace, formatTraceReportRow),
    formatRowsForReport('root-run trace tail', details.rootRunTrace, formatTraceReportRow),
    formatRowsForReport('recent trace tail', details.recentTraceTail, formatTraceReportRow),
  ].join('\n');
}

function formatUnexpectedAbortNodeErrorReport(details: UnexpectedAbortNodeErrorDiagnosticDetails): string {
  return [
    `event: ${formatRemoteDebuggerEvent(details.event)}`,
    `hints: ${details.diagnosisHints.join(' | ')}`,
    `counts: exactLifecycle=${details.lifecycleSummaries.length}, relatedLifecycle=${details.relatedLifecycleSummaries.length}, exactProcessTrace=${details.matchingProcessTrace.length}, relatedProcessTrace=${details.relatedProcessTrace.length}, rootRunTrace=${details.rootRunTrace.length}, recentTrace=${details.recentTraceEntryCount}`,
    formatRowsForReport('exact lifecycle', details.lifecycleSummaries, formatLifecycleReportRow),
    formatRowsForReport('related same-node/process lifecycle', details.relatedLifecycleSummaries, formatLifecycleReportRow),
    formatRowsForReport('exact process trace', details.matchingProcessTrace, formatTraceReportRow),
    formatRowsForReport('related same-node/process trace', details.relatedProcessTrace, formatTraceReportRow),
    formatRowsForReport('root-run trace tail', details.rootRunTrace, formatTraceReportRow),
    formatRowsForReport('recent trace tail', details.recentTraceTail, formatTraceReportRow),
  ].join('\n');
}

function formatNodeExcludedDiagnosticReport(details: NodeExcludedDiagnosticDetails): string {
  return [
    `event: ${formatRemoteDebuggerEvent(details.event)}`,
    `hints: ${details.diagnosisHints.join(' | ')}`,
    `counts: exactLifecycle=${details.lifecycleSummaries.length}, relatedLifecycle=${details.relatedLifecycleSummaries.length}, exactProcessTrace=${details.matchingProcessTrace.length}, relatedProcessTrace=${details.relatedProcessTrace.length}, rootRunTrace=${details.rootRunTrace.length}, recentTrace=${details.recentTraceEntryCount}`,
    formatRowsForReport('exact lifecycle', details.lifecycleSummaries, formatLifecycleReportRow),
    formatRowsForReport('related same-node/process lifecycle', details.relatedLifecycleSummaries, formatLifecycleReportRow),
    formatRowsForReport('exact process trace', details.matchingProcessTrace, formatTraceReportRow),
    formatRowsForReport('related same-node/process trace', details.relatedProcessTrace, formatTraceReportRow),
    formatRowsForReport('root-run trace tail', details.rootRunTrace, formatTraceReportRow),
    formatRowsForReport('recent trace tail', details.recentTraceTail, formatTraceReportRow),
  ].join('\n');
}

function buildNodeExcludedDiagnosisHints(event: RemoteDebuggerEventSummary): string[] {
  const reason = event.nodeExcludedReason ?? '<missing>';

  if (reason === 'Graph aborted successfully') {
    return [
      'A nodeExcluded terminal was observed and dispatched because this process was canceled by a successful graph abort.',
      'Compare the parentGraphRunId against nearby graphAbort, graphFinish, nodeFinish, and done events to find which graph aborted this branch.',
    ];
  }

  if (reason === 'Race branch lost') {
    return [
      'A nodeExcluded terminal was observed and dispatched because this process belonged to a losing race branch.',
      'If the workflow has no Race Inputs nodes, inspect the root-run trace for stale or unexpected race metadata propagation.',
    ];
  }

  if (reason === 'input is excluded value') {
    return [
      'A nodeExcluded terminal was observed and dispatched because at least one input was already control-flow-excluded.',
      'The cause is usually an upstream not-ran node; inspect the same graphRunId trace immediately before this event.',
    ];
  }

  return [
    `A nodeExcluded terminal was observed and dispatched with reason "${reason}".`,
    'This is not websocket event loss; inspect upstream control-flow, missing inputs, disabled nodes, and graph-run selection.',
  ];
}

function formatRowsForReport<T>(label: string, rows: T[], formatRow: (row: T) => string): string {
  if (rows.length === 0) {
    return `${label}: <none>`;
  }

  return [`${label} (${rows.length}):`, ...rows.map((row) => `  ${formatRow(row)}`)].join('\n');
}

function formatMissingEvent(event: MissingDebuggerTerminalEvent): string {
  return formatRemoteDebuggerEvent(event);
}

function formatRemoteDebuggerEvent(
  event: ProcessDiagnosticLookup & { graphId?: string; nodeExcludedReason?: string; nodeType?: string },
): string {
  const parts = [
    `rootRunId=${event.rootRunId ?? '<missing>'}`,
    `graphId=${event.graphId ?? '<missing>'}`,
    `graphRunId=${event.graphRunId ?? '<missing>'}`,
    `nodeId=${event.nodeId ?? '<missing>'}`,
    `processId=${event.processId ?? '<missing>'}`,
    `nodeType=${event.nodeType ?? '<missing>'}`,
  ];
  if (event.error) {
    parts.push(`error=${event.error}`);
  }
  if ('nodeExcludedReason' in event && event.nodeExcludedReason) {
    parts.push(`excludedReason=${event.nodeExcludedReason}`);
  }

  return parts.join(' ');
}

function formatLifecycleReportRow(row: FormattedProcessLifecycle): string {
  return [
    `node=${row.nodeId}`,
    `process=${row.processId}`,
    `type=${row.nodeType || '<missing>'}`,
    `messages=[${row.messages || '<none>'}]`,
    `receivedTerminal=[${row.receivedTerminal || '<none>'}]`,
    `dispatchedTerminal=[${row.dispatchedTerminal || '<none>'}]`,
    `lastDecision=${row.lastDecisionReason}`,
    `root=${row.rootRunId || '<missing>'}`,
    `graphRun=${row.graphRunId || '<missing>'}`,
    `parentGraphRun=${row.parentGraphRunId || '<missing>'}`,
    `lastSeq=${row.lastSequence}`,
    `outputs=[${row.outputPorts || '<none>'}]`,
  ].join(' ');
}

function formatTraceReportRow(row: FormattedTraceEntry): string {
  const parts = [
    `#${row.seq}`,
    row.message,
    `dispatch=${row.dispatch}`,
    `reason=${row.reason}`,
    `root=${row.rootRunId || '<missing>'}`,
    `graph=${row.graphId || '<missing>'}`,
    `graphRun=${row.graphRunId || '<missing>'}`,
    `parentGraphRun=${row.parentGraphRunId || '<missing>'}`,
    `node=${row.nodeId || '<missing>'}`,
    `process=${row.processId || '<missing>'}`,
    `type=${row.nodeType || '<missing>'}`,
    `outputs=[${row.outputPorts || '<none>'}]`,
  ];
  if (row.nodeExcludedReason) {
    parts.push(`excludedReason=${row.nodeExcludedReason}`);
  }
  if (row.error) {
    parts.push(`error=${row.error}`);
  }

  return parts.join(' ');
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

function formatErrorSummary(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (isRecord(error)) {
    const name = typeof error.name === 'string' ? error.name : undefined;
    const message = typeof error.message === 'string' ? error.message : undefined;

    if (name && message) {
      return `${name}: ${message}`;
    }

    return name ?? message ?? String(error);
  }

  return String(error);
}

function isAbortLikeErrorMessage(error: string): boolean {
  const normalized = error.trim();
  return (
    /^(Error:\s*)?(Aborted|Processing aborted|Process aborted)\.?$/i.test(normalized) ||
    /^AbortError\b/i.test(normalized) ||
    /\boperation was aborted\.?$/i.test(normalized)
  );
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
