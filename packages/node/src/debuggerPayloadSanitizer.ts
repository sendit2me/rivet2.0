import {
  createDebuggerTransportEscapedSentinelEnvelope,
  createDebuggerTransportUndefinedSentinel,
  isDebuggerTransportSentinelEnvelope,
} from '@valerypopoff/rivet2-core';

const MAX_DEBUGGER_PAYLOAD_DEPTH = 80;

export function sanitizeDebuggerPayloadForTransport(value: unknown): unknown {
  return sanitizeValue(value, new WeakSet<object>(), 0);
}

function sanitizeValue(value: unknown, ancestors: WeakSet<object>, depth: number): unknown {
  if (value === undefined) {
    return createDebuggerTransportUndefinedSentinel();
  }

  if (value == null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : `[Unserializable number: ${String(value)}]`;
  }

  if (typeof value === 'bigint') {
    return `[Unserializable bigint: ${value.toString()}]`;
  }

  if (typeof value === 'function') {
    return `[Unserializable function${value.name ? `: ${value.name}` : ''}]`;
  }

  if (typeof value === 'symbol') {
    return `[Unserializable symbol: ${String(value)}]`;
  }

  if (depth > MAX_DEBUGGER_PAYLOAD_DEPTH) {
    return '[Unserializable value: maximum debugger payload depth exceeded]';
  }

  if (ancestors.has(value)) {
    return '[Unserializable value: circular reference]';
  }

  ancestors.add(value);
  try {
    if (isDebuggerTransportSentinelEnvelope(value)) {
      const sanitizedEnvelope = sanitizeObject(value, ancestors, depth);
      return createDebuggerTransportEscapedSentinelEnvelope(sanitizedEnvelope);
    }

    const toJSONValue = sanitizeToJSONValue(value, ancestors, depth);
    if (toJSONValue.used) {
      return toJSONValue.value;
    }

    if (Array.isArray(value)) {
      return sanitizeArray(value, ancestors, depth);
    }

    return sanitizeObject(value, ancestors, depth);
  } finally {
    ancestors.delete(value);
  }
}

function sanitizeObject(value: object, ancestors: WeakSet<object>, depth: number): Record<string, unknown> | string {
  const sanitized: Record<string, unknown> = {};
  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch (err) {
    return `[Unserializable object keys: ${formatUnserializableReason(err)}]`;
  }

  for (const key of keys) {
    let propertyValue: unknown;
    try {
      propertyValue = (value as Record<string, unknown>)[key];
    } catch (err) {
      sanitized[key] = `[Unserializable property: ${formatUnserializableReason(err)}]`;
      continue;
    }

    sanitized[key] = sanitizeValue(propertyValue, ancestors, depth + 1);
  }

  return sanitized;
}

function sanitizeToJSONValue(
  value: object,
  ancestors: WeakSet<object>,
  depth: number,
): { used: true; value: unknown } | { used: false } {
  let toJSON: unknown;
  try {
    toJSON = (value as { toJSON?: unknown }).toJSON;
  } catch (err) {
    return {
      used: true,
      value: `[Unserializable toJSON property: ${formatUnserializableReason(err)}]`,
    };
  }

  if (typeof toJSON !== 'function') {
    return { used: false };
  }

  try {
    return {
      used: true,
      value: sanitizeValue((toJSON as (key: string) => unknown).call(value, ''), ancestors, depth + 1),
    };
  } catch (err) {
    return {
      used: true,
      value: `[Unserializable toJSON result: ${formatUnserializableReason(err)}]`,
    };
  }
}

function sanitizeArray(value: unknown[], ancestors: WeakSet<object>, depth: number): unknown[] | string {
  let length: number;
  try {
    length = value.length;
  } catch (err) {
    return `[Unserializable array length: ${formatUnserializableReason(err)}]`;
  }

  const sanitized: unknown[] = [];
  for (let index = 0; index < length; index++) {
    try {
      sanitized[index] = sanitizeValue(value[index], ancestors, depth + 1);
    } catch (err) {
      sanitized[index] = `[Unserializable array item: ${formatUnserializableReason(err)}]`;
    }
  }
  return sanitized;
}

function formatUnserializableReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
