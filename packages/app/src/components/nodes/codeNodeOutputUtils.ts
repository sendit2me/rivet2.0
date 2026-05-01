import { type NodeRunDataWithRefs, type ProcessDataForNode } from '../../state/dataFlow.js';

export type CodeNodeErrorLocation = {
  column?: number;
  line: number;
};

export type CodeNodeErrorLineHighlight = {
  line: number;
  runKey: string;
  source: string;
};

export type ParsedCodeNodeError = {
  location?: CodeNodeErrorLocation;
  message: string;
};

const CODE_NODE_LOCATION_SUFFIX = /\s*\(Code node line (\d+)(?:, column (\d+))?\)$/;

export function parseCodeNodeError(error: string): ParsedCodeNodeError {
  const match = error.match(CODE_NODE_LOCATION_SUFFIX);

  if (!match) {
    return { message: error };
  }

  if (match.index == null) {
    return { message: error };
  }

  const line = Number(match[1]);
  const column = match[2] != null ? Number(match[2]) : undefined;

  if (!Number.isFinite(line) || line < 1 || (column != null && (!Number.isFinite(column) || column < 1))) {
    return { message: error };
  }

  return {
    location: {
      column,
      line,
    },
    message: error.slice(0, match.index).trimEnd(),
  };
}

export function getCodeNodeErrorViewModel(data: NodeRunDataWithRefs): ParsedCodeNodeError {
  return parseCodeNodeError(data.status?.type === 'error' ? data.status.error : '');
}

export function getCodeNodeErrorLineHighlight(
  processData: ProcessDataForNode | undefined,
): CodeNodeErrorLineHighlight | undefined {
  if (processData?.data.status?.type !== 'error') {
    return undefined;
  }

  const source = processData.data.debugData?.codeSource;
  const location = parseCodeNodeError(processData.data.status.error).location;

  if (!source || !location) {
    return undefined;
  }

  return {
    line: location.line,
    runKey: processData.processId,
    source,
  };
}
