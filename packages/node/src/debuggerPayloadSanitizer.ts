import {
  createDebuggerTransportEscapedSentinelEnvelope,
  createDebuggerTransportUndefinedSentinel,
  isDebuggerTransportSentinelEnvelope,
} from '@valerypopoff/rivet2-core';

const MAX_DEBUGGER_PAYLOAD_DEPTH = 80;

export function sanitizeDebuggerPayloadForTransport(value: unknown): unknown {
  return prepareDebuggerPayloadForTransport(value);
}

export function stringifyDebuggerPayloadForTransport(value: unknown): string {
  return JSON.stringify(prepareDebuggerPayloadForTransport(value))!;
}

function sanitizePrimitiveValue(value: unknown): { used: true; value: unknown } | { used: false } {
  if (value === undefined) {
    return {
      used: true,
      value: createDebuggerTransportUndefinedSentinel(),
    };
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return {
      used: true,
      value: `[Unserializable number: ${String(value)}]`,
    };
  }

  if (typeof value === 'bigint') {
    return {
      used: true,
      value: `[Unserializable bigint: ${value.toString()}]`,
    };
  }

  if (typeof value === 'function') {
    return {
      used: true,
      value: `[Unserializable function${value.name ? `: ${value.name}` : ''}]`,
    };
  }

  if (typeof value === 'symbol') {
    return {
      used: true,
      value: `[Unserializable symbol: ${String(value)}]`,
    };
  }

  return { used: false };
}

function prepareDebuggerPayloadForTransport(value: unknown): unknown {
  return prepareValue(value, new WeakSet<object>(), 0).value;
}

function preparePrimitiveValue(value: unknown): { used: true; value: unknown; changed: boolean } | { used: false } {
  const sanitizedPrimitive = sanitizePrimitiveValue(value);
  if (sanitizedPrimitive.used) {
    return {
      used: true,
      value: sanitizedPrimitive.value,
      changed: true,
    };
  }

  if (value == null || typeof value !== 'object') {
    return {
      used: true,
      value,
      changed: false,
    };
  }

  return { used: false };
}

function prepareValue(
  value: unknown,
  ancestors: WeakSet<object>,
  depth: number,
): { value: unknown; changed: boolean } {
  const primitiveValue = preparePrimitiveValue(value);
  if (primitiveValue.used) {
    return {
      value: primitiveValue.value,
      changed: primitiveValue.changed,
    };
  }

  if (typeof value !== 'object' || value == null) {
    return {
      value,
      changed: false,
    };
  }

  if (depth > MAX_DEBUGGER_PAYLOAD_DEPTH) {
    return {
      value: '[Unserializable value: maximum debugger payload depth exceeded]',
      changed: true,
    };
  }

  if (ancestors.has(value)) {
    return {
      value: '[Unserializable value: circular reference]',
      changed: true,
    };
  }

  if (isDebuggerTransportSentinelEnvelope(value)) {
    ancestors.add(value);
    try {
      const preparedEnvelope = prepareObject(value, ancestors, depth);
      return {
        value: createDebuggerTransportEscapedSentinelEnvelope(preparedEnvelope.value),
        changed: true,
      };
    } finally {
      ancestors.delete(value);
    }
  }

  ancestors.add(value);
  try {
    const toJSONValue = prepareToJSONValue(value, ancestors, depth);
    if (toJSONValue.used) {
      return {
        value: toJSONValue.value,
        changed: true,
      };
    }

    if (Array.isArray(value)) {
      return prepareArray(value, ancestors, depth);
    }

    return prepareObject(value, ancestors, depth);
  } finally {
    ancestors.delete(value);
  }
}

function prepareToJSONValue(
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
      value: prepareValue((toJSON as (key: string) => unknown).call(value, ''), ancestors, depth + 1).value,
    };
  } catch (err) {
    return {
      used: true,
      value: `[Unserializable toJSON result: ${formatUnserializableReason(err)}]`,
    };
  }
}

function prepareArray(
  value: unknown[],
  ancestors: WeakSet<object>,
  depth: number,
): { value: unknown; changed: boolean } {
  let length: number;
  try {
    length = value.length;
  } catch (err) {
    return {
      value: `[Unserializable array length: ${formatUnserializableReason(err)}]`,
      changed: true,
    };
  }

  let prepared: unknown[] | undefined;
  for (let index = 0; index < length; index++) {
    let itemValue: unknown;
    try {
      itemValue = value[index];
    } catch (err) {
      prepared ??= copyKnownArrayItems(value, index);
      prepared[index] = `[Unserializable array item: ${formatUnserializableReason(err)}]`;
      continue;
    }

    const item = prepareValue(itemValue, ancestors, depth + 1);
    if (prepared) {
      prepared[index] = item.value;
    } else if (item.changed) {
      prepared = copyKnownArrayItems(value, index);
      prepared[index] = item.value;
    }
  }

  return prepared
    ? {
        value: prepared,
        changed: true,
      }
    : {
        value,
        changed: false,
      };
}

function copyKnownArrayItems(value: unknown[], stopBeforeIndex: number): unknown[] {
  const copy: unknown[] = [];
  for (let index = 0; index < stopBeforeIndex; index++) {
    try {
      copy[index] = value[index];
    } catch (err) {
      copy[index] = `[Unserializable array item: ${formatUnserializableReason(err)}]`;
    }
  }
  return copy;
}

function prepareObject(
  value: object,
  ancestors: WeakSet<object>,
  depth: number,
): { value: unknown; changed: boolean } {
  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch (err) {
    return {
      value: `[Unserializable object keys: ${formatUnserializableReason(err)}]`,
      changed: true,
    };
  }

  let prepared: Record<string, unknown> | undefined = shouldCloneObjectForJsonShape(value) ? {} : undefined;
  for (const key of keys) {
    let propertyValue: unknown;
    try {
      propertyValue = (value as Record<string, unknown>)[key];
    } catch (err) {
      prepared ??= copyKnownProperties(value, keys, key);
      prepared[key] = `[Unserializable property: ${formatUnserializableReason(err)}]`;
      continue;
    }

    const property = prepareValue(propertyValue, ancestors, depth + 1);
    if (prepared) {
      prepared[key] = property.value;
    } else if (property.changed) {
      prepared = copyKnownProperties(value, keys, key);
      prepared[key] = property.value;
    }
  }

  return prepared
    ? {
        value: prepared,
        changed: true,
      }
    : {
        value,
        changed: false,
      };
}

function shouldCloneObjectForJsonShape(value: object): boolean {
  try {
    const tag = Object.prototype.toString.call(value);
    return (
      tag === '[object BigInt]' ||
      tag === '[object Boolean]' ||
      tag === '[object Number]' ||
      tag === '[object String]' ||
      tag === '[object Symbol]'
    );
  } catch {
    return true;
  }
}

function copyKnownProperties(value: object, keys: string[], stopBeforeKey: string): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === stopBeforeKey) {
      break;
    }

    try {
      copy[key] = (value as Record<string, unknown>)[key];
    } catch (err) {
      copy[key] = `[Unserializable property: ${formatUnserializableReason(err)}]`;
    }
  }
  return copy;
}

function formatUnserializableReason(error: unknown): string {
  try {
    if (error instanceof Error) {
      return error.message;
    }
  } catch {
    // Fall through to best-effort string conversion below.
  }

  try {
    return String(error);
  } catch {
    return 'unavailable reason';
  }
}
