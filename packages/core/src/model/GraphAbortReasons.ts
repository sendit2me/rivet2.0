export const RACE_LOSER_EXCLUSION_REASON = 'Race branch lost';
export const SUCCESSFUL_GRAPH_ABORT_EXCLUSION_REASON = 'Graph aborted successfully';

const GRAPH_ABORT_REASON_MARKER = 'rivet:graph-abort-reason';

export type GraphAbortReason = {
  error?: Error | string;
  marker: typeof GRAPH_ABORT_REASON_MARKER;
  successful: boolean;
};

export function createGraphAbortReason(successful: boolean, error?: Error | string): GraphAbortReason {
  return {
    error,
    marker: GRAPH_ABORT_REASON_MARKER,
    successful,
  };
}

export function getAbortSignalReason(signal: AbortSignal | undefined): unknown {
  return signal ? (signal as AbortSignal & { reason?: unknown }).reason : undefined;
}

export function getGraphAbortReasonFromSignal(signal: AbortSignal | undefined): GraphAbortReason | undefined {
  return getGraphAbortReason(getAbortSignalReason(signal));
}

function getGraphAbortReason(reason: unknown): GraphAbortReason | undefined {
  if (!isGraphAbortReason(reason)) {
    return undefined;
  }

  return reason;
}

function isGraphAbortReason(reason: unknown): reason is GraphAbortReason {
  return (
    typeof reason === 'object' &&
    reason != null &&
    (reason as { marker?: unknown }).marker === GRAPH_ABORT_REASON_MARKER &&
    typeof (reason as { successful?: unknown }).successful === 'boolean'
  );
}
