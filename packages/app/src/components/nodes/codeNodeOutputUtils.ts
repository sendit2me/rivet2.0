export type CodeNodeErrorLocation = {
  column?: number;
  line: number;
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

  if (!Number.isFinite(line) || (column != null && !Number.isFinite(column))) {
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
