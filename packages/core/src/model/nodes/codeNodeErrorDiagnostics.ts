import type { NodeId } from '../NodeBase.js';
import type { ProcessId } from '../ProcessContext.js';
import { getError } from '../../utils/errors.js';

const ASYNC_FUNCTION_LINE_OFFSET = 2;
const SYNTAX_PARSE_WRAPPER_LINE_OFFSET = 1;

type CodeNodeErrorLocation = {
  column?: number;
  line: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeSourceUrlPart(value: unknown): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function buildCodeNodeSourceUrl(nodeId: NodeId, processId?: ProcessId): string {
  const processPart = processId ? `-${sanitizeSourceUrlPart(processId)}` : '';
  return `rivet-code-node-${sanitizeSourceUrlPart(nodeId)}${processPart}.js`;
}

export function appendCodeNodeSourceUrl(code: string, sourceUrl: string): string {
  return `${code}\n//# sourceURL=${sourceUrl}`;
}

function getRuntimeErrorLocationFromStack(params: {
  code: string;
  error: Error;
  sourceUrl: string;
}): CodeNodeErrorLocation | undefined {
  if (!params.error.stack) {
    return undefined;
  }

  const sourceUrlPattern = escapeRegExp(params.sourceUrl);
  const framePattern = new RegExp(`${sourceUrlPattern}:(\\d+):(\\d+)`);
  const match = params.error.stack.match(framePattern);

  if (!match) {
    return undefined;
  }

  const generatedLine = Number(match[1]);
  const column = Number(match[2]);
  const line = generatedLine - ASYNC_FUNCTION_LINE_OFFSET;
  const lineCount = Math.max(params.code.split(/\r?\n/).length, 1);

  if (!Number.isFinite(line) || line < 1 || line > lineCount) {
    return undefined;
  }

  return {
    column: Number.isFinite(column) ? column : undefined,
    line,
  };
}

function getParserErrorLocation(error: unknown): { column?: number; line: number } | undefined {
  if (!error || typeof error !== 'object' || !('loc' in error)) {
    return undefined;
  }

  const loc = (error as { loc?: { column?: number; line?: number } }).loc;
  if (!loc || typeof loc.line !== 'number') {
    return undefined;
  }

  return {
    column: typeof loc.column === 'number' ? loc.column + 1 : undefined,
    line: loc.line,
  };
}

async function getSyntaxErrorLocation(code: string, error: Error): Promise<CodeNodeErrorLocation | undefined> {
  if (error.name !== 'SyntaxError') {
    return undefined;
  }

  const wrappedCode = `async function __rivetCodeNode__() {\n${code}\n}`;

  try {
    const { parse } = await import('acorn');
    parse(wrappedCode, {
      ecmaVersion: 'latest',
      locations: true,
      sourceType: 'script',
    });
  } catch (parseError) {
    const parserLocation = getParserErrorLocation(parseError);
    if (!parserLocation) {
      return undefined;
    }

    const lineCount = Math.max(code.split(/\r?\n/).length, 1);
    const line = Math.min(
      Math.max(parserLocation.line - SYNTAX_PARSE_WRAPPER_LINE_OFFSET, 1),
      lineCount,
    );

    return {
      column: parserLocation.column,
      line,
    };
  }

  return undefined;
}

function formatLocationSuffix(location: CodeNodeErrorLocation): string {
  const columnText = location.column != null ? `, column ${location.column}` : '';
  return `Code node line ${location.line}${columnText}`;
}

function replaceStackHeader(stack: string | undefined, error: Error): string | undefined {
  if (!stack) {
    return undefined;
  }

  const lines = stack.split('\n');
  lines[0] = error.toString();
  return lines.join('\n');
}

export async function enrichCodeNodeErrorWithLocation(params: {
  code: string;
  error: unknown;
  sourceUrl: string;
}): Promise<Error> {
  const originalError = getError(params.error);
  const location =
    getRuntimeErrorLocationFromStack({
      code: params.code,
      error: originalError,
      sourceUrl: params.sourceUrl,
    }) ?? (await getSyntaxErrorLocation(params.code, originalError));

  if (!location) {
    return originalError;
  }

  originalError.message = `${originalError.message} (${formatLocationSuffix(location)})`;
  originalError.stack = replaceStackHeader(originalError.stack, originalError);

  return originalError;
}
