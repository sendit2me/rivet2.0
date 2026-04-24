import type { DataValue } from '../model/DataValue.js';

const MAX_ERROR_MESSAGE_LENGTH = 500;

export function isRuntimeDebugLoggingEnabled(): boolean {
  const processEnv = globalThis.process?.env;
  if (processEnv?.RIVET_DEBUG_RUNTIME_LOGS === 'true') {
    return true;
  }

  try {
    return globalThis.localStorage?.getItem('rivet.debugRuntimeLogs') === 'true';
  } catch {
    return false;
  }
}

export function summarizePortMapForLog(values: Record<string, DataValue> | undefined): Record<string, unknown> {
  if (!values) {
    return {};
  }

  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, summarizeDataValueForLog(value)]));
}

export function summarizeDataValueForLog(value: DataValue | undefined): Record<string, unknown> {
  if (!value) {
    return { type: 'undefined' };
  }

  return {
    type: value.type,
    value: summarizeUnknownForLog(value.value),
  };
}

export function summarizeUnknownForLog(value: unknown): Record<string, unknown> {
  if (value == null) {
    return { kind: String(value) };
  }

  if (typeof value === 'string') {
    return { kind: 'string', length: value.length };
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return { kind: typeof value };
  }

  if (Array.isArray(value)) {
    return { kind: 'array', length: value.length };
  }

  if (ArrayBuffer.isView(value)) {
    return { kind: 'array-buffer-view', byteLength: value.byteLength };
  }

  if (value instanceof ArrayBuffer) {
    return { kind: 'array-buffer', byteLength: value.byteLength };
  }

  if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
    return { kind: 'shared-array-buffer', byteLength: value.byteLength };
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return { kind: 'blob', size: value.size, type: value.type };
  }

  if (value instanceof Date) {
    return { kind: 'date' };
  }

  if (typeof value === 'object') {
    return { kind: 'object', keyCount: getObjectKeyCountForLog(value) };
  }

  return { kind: typeof value };
}

export function summarizeErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: truncateForLog(error.message),
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: truncateForLog(error),
    };
  }

  return {
    name: 'UnknownError',
    value: summarizeUnknownForLog(error),
  };
}

export function logRuntimeInfo(message: string, metadata?: Record<string, unknown>): void {
  if (metadata) {
    console.log(message, metadata);
  } else {
    console.log(message);
  }
}

export function logRuntimeWarn(message: string, metadata?: Record<string, unknown>): void {
  if (metadata) {
    console.warn(message, metadata);
  } else {
    console.warn(message);
  }
}

export function logRuntimeError(message: string, error: unknown, metadata?: Record<string, unknown>): void {
  console.error(message, {
    ...metadata,
    error: summarizeErrorForLog(error),
  });
}

export function logRuntimeDebug(message: string, metadata?: Record<string, unknown>): void {
  if (!isRuntimeDebugLoggingEnabled()) {
    return;
  }

  logRuntimeInfo(message, metadata);
}

function truncateForLog(value: string): string {
  if (value.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`;
}

function getObjectKeyCountForLog(value: object): number | 'unknown' {
  try {
    return Object.keys(value).length;
  } catch {
    return 'unknown';
  }
}
