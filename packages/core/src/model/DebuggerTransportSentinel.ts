const DEBUGGER_TRANSPORT_SENTINEL_KEY = '__rivetDebuggerTransportSentinel';
const DEBUGGER_TRANSPORT_SENTINEL_VERSION = 1;

type DebuggerTransportUndefinedSentinel = {
  [DEBUGGER_TRANSPORT_SENTINEL_KEY]: {
    type: 'undefined';
    version: typeof DEBUGGER_TRANSPORT_SENTINEL_VERSION;
  };
};

type DebuggerTransportEscapedSentinel = {
  [DEBUGGER_TRANSPORT_SENTINEL_KEY]: {
    type: 'escaped-sentinel';
    version: typeof DEBUGGER_TRANSPORT_SENTINEL_VERSION;
    value: unknown;
  };
};

type DebuggerTransportSentinel =
  | DebuggerTransportUndefinedSentinel[typeof DEBUGGER_TRANSPORT_SENTINEL_KEY]
  | DebuggerTransportEscapedSentinel[typeof DEBUGGER_TRANSPORT_SENTINEL_KEY];

export function createDebuggerTransportUndefinedSentinel(): DebuggerTransportUndefinedSentinel {
  return {
    [DEBUGGER_TRANSPORT_SENTINEL_KEY]: {
      type: 'undefined',
      version: DEBUGGER_TRANSPORT_SENTINEL_VERSION,
    },
  };
}

export function createDebuggerTransportEscapedSentinel(value: unknown): DebuggerTransportEscapedSentinel {
  return {
    [DEBUGGER_TRANSPORT_SENTINEL_KEY]: {
      type: 'escaped-sentinel',
      version: DEBUGGER_TRANSPORT_SENTINEL_VERSION,
      value,
    },
  };
}

export function createDebuggerTransportEscapedSentinelEnvelope(value: unknown): DebuggerTransportEscapedSentinel {
  return createDebuggerTransportEscapedSentinel(getDebuggerTransportSentinel(value) ?? value);
}

export function isDebuggerTransportSentinelEnvelope(value: unknown): boolean {
  return getDebuggerTransportSentinel(value) != null;
}

export function decodeDebuggerTransportSentinels<T>(value: T): T {
  return decodeDebuggerTransportSentinelsInner(value) as T;
}

function decodeDebuggerTransportSentinelsInner(value: unknown): unknown {
  const sentinel = getDebuggerTransportSentinel(value);
  if (sentinel) {
    if (sentinel.type === 'undefined') {
      return undefined;
    }

    if (sentinel.type === 'escaped-sentinel') {
      return {
        [DEBUGGER_TRANSPORT_SENTINEL_KEY]: decodeDebuggerTransportSentinelsInner(sentinel.value),
      };
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => decodeDebuggerTransportSentinelsInner(item));
  }

  if (typeof value !== 'object' || value == null) {
    return value;
  }

  const decoded: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    decoded[key] = decodeDebuggerTransportSentinelsInner(item);
  }
  return decoded;
}

function getDebuggerTransportSentinel(value: unknown): DebuggerTransportSentinel | undefined {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    return undefined;
  }

  const valueKeys = Object.keys(value);
  if (valueKeys.length !== 1 || valueKeys[0] !== DEBUGGER_TRANSPORT_SENTINEL_KEY) {
    return undefined;
  }

  const sentinel = (value as Record<string, unknown>)[DEBUGGER_TRANSPORT_SENTINEL_KEY];
  if (typeof sentinel !== 'object' || sentinel == null || Array.isArray(sentinel)) {
    return undefined;
  }

  const typedSentinel = sentinel as Record<string, unknown>;
  const sentinelKeys = Object.keys(typedSentinel);
  if (typedSentinel.type === 'undefined') {
    return sentinelKeys.length === 2 && typedSentinel.version === DEBUGGER_TRANSPORT_SENTINEL_VERSION
      ? (typedSentinel as DebuggerTransportUndefinedSentinel[typeof DEBUGGER_TRANSPORT_SENTINEL_KEY])
      : undefined;
  }

  if (typedSentinel.type === 'escaped-sentinel') {
    return sentinelKeys.length === 3 && typedSentinel.version === DEBUGGER_TRANSPORT_SENTINEL_VERSION
      ? (typedSentinel as DebuggerTransportEscapedSentinel[typeof DEBUGGER_TRANSPORT_SENTINEL_KEY])
      : undefined;
  }

  return undefined;
}
