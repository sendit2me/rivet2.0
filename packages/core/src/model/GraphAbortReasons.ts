export const RACE_LOSER_EXCLUSION_REASON = 'Race branch lost';
export const SUCCESSFUL_GRAPH_ABORT_EXCLUSION_REASON = 'Graph aborted successfully';

const GRAPH_ABORT_ERROR_MARKER = 'rivet:graph-abort-error';
const GRAPH_ABORT_REASON_MARKER = 'rivet:graph-abort-reason';

export type GraphAbortReason = {
  error?: Error | string;
  marker: typeof GRAPH_ABORT_REASON_MARKER;
  successful: boolean;
};

export type GraphAbortError = Error & {
  graphAbortReason?: GraphAbortReason;
  marker: typeof GRAPH_ABORT_ERROR_MARKER;
};

export function createGraphAbortReason(successful: boolean, error?: Error | string): GraphAbortReason {
  return {
    error,
    marker: GRAPH_ABORT_REASON_MARKER,
    successful,
  };
}

export function createGraphAbortError(
  reason: GraphAbortReason | undefined,
  message = 'Processing aborted',
): GraphAbortError {
  const error = new Error(message) as GraphAbortError;
  Object.defineProperties(error, {
    graphAbortReason: {
      configurable: true,
      value: reason,
    },
    marker: {
      configurable: true,
      value: GRAPH_ABORT_ERROR_MARKER,
    },
  });
  return error;
}

export function createGraphAbortErrorFromSignal(
  signal: AbortSignal | undefined,
  message = 'Processing aborted',
): GraphAbortError {
  return createGraphAbortError(getGraphAbortReasonFromSignal(signal), message);
}

export function getAbortSignalReason(signal: AbortSignal | undefined): unknown {
  return signal ? (signal as AbortSignal & { reason?: unknown }).reason : undefined;
}

export function getGraphAbortReasonFromSignal(signal: AbortSignal | undefined): GraphAbortReason | undefined {
  return getGraphAbortReason(getAbortSignalReason(signal));
}

export function getGraphAbortReasonFromError(error: unknown): GraphAbortReason | undefined {
  if (!isGraphAbortError(error)) {
    return undefined;
  }

  return error.graphAbortReason;
}

export function isRaceLoserGraphAbortReason(reason: GraphAbortReason | undefined): boolean {
  return reason?.successful === true && reason.error === RACE_LOSER_EXCLUSION_REASON;
}

export function isSuccessfulNonRaceGraphAbortReason(reason: GraphAbortReason | undefined): boolean {
  return reason?.successful === true && !isRaceLoserGraphAbortReason(reason);
}

export function isAbortLikeError(error: Error): boolean {
  const normalized = `${error.name}: ${error.message}`.trim();
  return (
    /^(Error:\s*)?(Aborted|Processing aborted|Process aborted)\.?$/i.test(error.message.trim()) ||
    /^AbortError\b/i.test(normalized) ||
    /\boperation was aborted\.?$/i.test(error.message.trim())
  );
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

function isGraphAbortError(error: unknown): error is GraphAbortError {
  return (
    typeof error === 'object' &&
    error != null &&
    (error as { marker?: unknown }).marker === GRAPH_ABORT_ERROR_MARKER
  );
}
