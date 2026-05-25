import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  createDebuggerTransportEscapedSentinelEnvelope,
  createDebuggerTransportUndefinedSentinel,
  isDebuggerTransportSentinelEnvelope,
} from '@valerypopoff/rivet2-core';
import { stringifyDebuggerPayloadForTransport } from '../src/debuggerPayloadSanitizer.js';

type BenchmarkCase = {
  name: string;
  iterations: number;
  createPayload: () => unknown;
};

type BenchmarkResult = {
  name: string;
  oldMsPerEvent: number;
  newMsPerEvent: number;
  speedup: number;
  bytes: number;
};

const SAMPLE_COUNT = 7;
const MAX_DEBUGGER_PAYLOAD_DEPTH = 80;

const cases: BenchmarkCase[] = [
  {
    name: 'nodeFinish nested object output',
    iterations: 5000,
    createPayload: () => makeNodeFinishPayload(makeLargeObject(60, 12)),
  },
  {
    name: 'graphFinish subgraph outputs',
    iterations: 5000,
    createPayload: () => ({
      data: {
        execution: makeExecution('subgraph-2', 'subgraph-2-run', 'subgraph-1-run'),
        graph: makeGraph('subgraph-2'),
        outputs: {
          cost: { type: 'number', value: 0.012 },
          duration: { type: 'number', value: 42 },
          output: { type: 'object', value: makeLargeObject(40, 8) },
        },
      },
      message: 'graphFinish',
      requestId: 'request-1',
    }),
  },
  {
    name: 'nodeStart fan-in inputs',
    iterations: 7500,
    createPayload: () => ({
      data: {
        execution: makeExecution('subgraph-2', 'subgraph-2-run', 'subgraph-1-run'),
        inputs: Object.fromEntries(
          Array.from({ length: 20 }, (_, index) => [
            `input-${index}`,
            { type: 'object', value: makeLargeObject(8, 3) },
          ]),
        ),
        node: makeNode('expression-1', 'expression'),
        processId: 'process-1',
      },
      message: 'nodeStart',
      requestId: 'request-1',
    }),
  },
  {
    name: 'non-json-safe expression output',
    iterations: 5000,
    createPayload: () => {
      const circular: Record<string, unknown> = {
        bigint: 1n,
        boxedBigInt: Object(1n),
        boxedNumber: Object.assign(new Number(5), { label: 'number' }),
        boxedString: Object.assign(new String('abc'), { label: 'string' }),
        fn: function benchmarkFunction() {},
        infinity: Infinity,
        nan: NaN,
        symbol: Symbol('debugger-bench'),
        undefinedValue: undefined,
      };
      circular.self = circular;
      return makeNodeFinishPayload(circular);
    },
  },
];

function oldStringify(payload: unknown): string {
  return JSON.stringify(sanitizeDebuggerPayloadBaseline(payload));
}

function runCase(benchmarkCase: BenchmarkCase): BenchmarkResult {
  assertEquivalentPayload(benchmarkCase);

  const { newSamples, oldSamples } = measureCase(benchmarkCase);
  const oldMsPerEvent = average(oldSamples.map((sample) => sample.msPerEvent));
  const newMsPerEvent = average(newSamples.map((sample) => sample.msPerEvent));
  const bytes = Math.round(average(newSamples.map((sample) => sample.bytes)));

  return {
    name: benchmarkCase.name,
    oldMsPerEvent,
    newMsPerEvent,
    speedup: oldMsPerEvent / newMsPerEvent,
    bytes,
  };
}

function assertEquivalentPayload(benchmarkCase: BenchmarkCase) {
  const payload = benchmarkCase.createPayload();
  assert.deepEqual(
    JSON.parse(stringifyDebuggerPayloadForTransport(payload)),
    JSON.parse(oldStringify(payload)),
    `${benchmarkCase.name} serialized output must match the old debugger transport shape`,
  );
}

function measureCase(benchmarkCase: BenchmarkCase): {
  newSamples: Array<{ bytes: number; msPerEvent: number }>;
  oldSamples: Array<{ bytes: number; msPerEvent: number }>;
} {
  const newSamples: Array<{ bytes: number; msPerEvent: number }> = [];
  const oldSamples: Array<{ bytes: number; msPerEvent: number }> = [];

  for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex++) {
    const payload = benchmarkCase.createPayload();
    const oldFirst = sampleIndex % 2 === 0;
    const first = measureStringify(payload, benchmarkCase.iterations, oldFirst ? oldStringify : stringifyDebuggerPayloadForTransport);
    const second = measureStringify(payload, benchmarkCase.iterations, oldFirst ? stringifyDebuggerPayloadForTransport : oldStringify);

    if (oldFirst) {
      oldSamples.push(first);
      newSamples.push(second);
    } else {
      newSamples.push(first);
      oldSamples.push(second);
    }
  }

  return {
    newSamples: newSamples.slice(1),
    oldSamples: oldSamples.slice(1),
  };
}

function measureStringify(
  payload: unknown,
  iterations: number,
  stringify: (payload: unknown) => string,
): { bytes: number; msPerEvent: number } {
  let bytes = 0;
  const start = performance.now();

  for (let iteration = 0; iteration < iterations; iteration++) {
    bytes += stringify(payload).length;
  }

  const elapsedMs = performance.now() - start;
  return {
    bytes: bytes / iterations,
    msPerEvent: elapsedMs / iterations,
  };
}

function sanitizeDebuggerPayloadBaseline(value: unknown): unknown {
  return sanitizeBaselineValue(value, new WeakSet<object>(), 0);
}

function sanitizeBaselineValue(value: unknown, ancestors: WeakSet<object>, depth: number): unknown {
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
      return createDebuggerTransportEscapedSentinelEnvelope(sanitizeBaselineObject(value, ancestors, depth));
    }

    const toJSONValue = sanitizeBaselineToJSONValue(value, ancestors, depth);
    if (toJSONValue.used) {
      return toJSONValue.value;
    }

    if (Array.isArray(value)) {
      return sanitizeBaselineArray(value, ancestors, depth);
    }

    return sanitizeBaselineObject(value, ancestors, depth);
  } finally {
    ancestors.delete(value);
  }
}

function sanitizeBaselineObject(
  value: object,
  ancestors: WeakSet<object>,
  depth: number,
): Record<string, unknown> | string {
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

    sanitized[key] = sanitizeBaselineValue(propertyValue, ancestors, depth + 1);
  }

  return sanitized;
}

function sanitizeBaselineToJSONValue(
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
      value: sanitizeBaselineValue((toJSON as (key: string) => unknown).call(value, ''), ancestors, depth + 1),
    };
  } catch (err) {
    return {
      used: true,
      value: `[Unserializable toJSON result: ${formatUnserializableReason(err)}]`,
    };
  }
}

function sanitizeBaselineArray(value: unknown[], ancestors: WeakSet<object>, depth: number): unknown[] | string {
  let length: number;
  try {
    length = value.length;
  } catch (err) {
    return `[Unserializable array length: ${formatUnserializableReason(err)}]`;
  }

  const sanitized: unknown[] = [];
  for (let index = 0; index < length; index++) {
    try {
      sanitized[index] = sanitizeBaselineValue(value[index], ancestors, depth + 1);
    } catch (err) {
      sanitized[index] = `[Unserializable array item: ${formatUnserializableReason(err)}]`;
    }
  }
  return sanitized;
}

function formatUnserializableReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeExecution(graphId: string, graphRunId: string, parentGraphRunId?: string) {
  return {
    graphId,
    graphRunId,
    parentGraphRunId,
    rootRunId: 'root-run',
  };
}

function makeGraph(id: string) {
  return {
    connections: [],
    metadata: {
      id,
      name: id,
    },
    nodes: [makeNode('graph-input-1', 'graphInput'), makeNode('expression-1', 'expression')],
  };
}

function makeNode(id: string, type: string) {
  return {
    data: {},
    id,
    title: type,
    type,
    visualData: {
      x: 0,
      y: 0,
    },
  };
}

function makeNodeFinishPayload(value: unknown) {
  return {
    data: {
      durationMs: 3.5,
      execution: makeExecution('subgraph-2', 'subgraph-2-run', 'subgraph-1-run'),
      node: makeNode('expression-1', 'expression'),
      outputs: {
        output: {
          type: 'any',
          value,
        },
      },
      processId: 'process-1',
    },
    message: 'nodeFinish',
    requestId: 'request-1',
  };
}

function makeLargeObject(fields: number, arrayLength: number): Record<string, unknown> {
  return Object.fromEntries(
    Array.from({ length: fields }, (_, fieldIndex) => [
      `field_${fieldIndex}`,
      {
        enabled: fieldIndex % 2 === 0,
        id: `value-${fieldIndex}`,
        items: Array.from({ length: arrayLength }, (_, itemIndex) => ({
          index: itemIndex,
          text: `nested value ${fieldIndex}:${itemIndex}`,
        })),
      },
    ]),
  );
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatMs(value: number): string {
  return value.toFixed(4);
}

function formatSpeedup(value: number): string {
  return `${value.toFixed(2)}x`;
}

const results = cases.map(runCase);

console.log('| Case | Old ms/event | New ms/event | Speedup | Bytes/event |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const result of results) {
  console.log(
    `| ${result.name} | ${formatMs(result.oldMsPerEvent)} | ${formatMs(result.newMsPerEvent)} | ${formatSpeedup(
      result.speedup,
    )} | ${result.bytes} |`,
  );
}
