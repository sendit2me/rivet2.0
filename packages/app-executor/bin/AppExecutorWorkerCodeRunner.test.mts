import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  CodeNodeImpl,
  GraphProcessor,
  TextNodeImpl,
  createBuiltInRegistry,
  type ChartNode,
  type DataValue,
  type GraphId,
  type NodeGraph,
  type NodeId,
  type Outputs,
  type PortId,
  type ProcessContext,
  type Project,
  type Tokenizer,
} from '@ironclad/rivet-core';
import { AppExecutorWorkerCodeRunner } from './AppExecutorWorkerCodeRunner.mjs';

const tokenizer: Tokenizer = {
  on: () => undefined,
  getTokenCountForMessages: async () => 0,
  getTokenCountForString: async () => 0,
};

function testProcessContext(): ProcessContext {
  return {
    codeRunner: new AppExecutorWorkerCodeRunner(),
    settings: {},
    tokenizer,
  };
}

function makeProject(graph: NodeGraph): Project {
  return {
    graphs: {
      [graph.metadata!.id!]: graph,
    },
    metadata: {
      id: 'app-executor-worker-test-project' as GraphId,
      mainGraphId: graph.metadata!.id,
      title: 'App Executor Worker Test Project',
    },
  } as Project;
}

function makeCodeNode(code: string): ChartNode {
  const node = CodeNodeImpl.create();
  node.id = 'code-node' as NodeId;
  node.title = 'Code';
  node.data = {
    ...node.data,
    code,
    inputNames: [],
    outputNames: ['output1'],
  };
  return node;
}

function makeTextNode(): ChartNode {
  const node = TextNodeImpl.create();
  node.id = 'text-node' as NodeId;
  node.title = 'Text';
  node.data = {
    ...node.data,
    text: 'ready',
  };
  return node;
}

void describe('AppExecutorWorkerCodeRunner', () => {
  void it('runs synchronous code in a worker and returns outputs', async () => {
    const runner = new AppExecutorWorkerCodeRunner();

    const outputs = await runner.runCode(
      `
        const end = Date.now() + 25;
        while (Date.now() < end) {}
        return { output1: { type: 'string', value: 'done' } };
      `,
      {},
      {
        includeConsole: false,
        includeFetch: false,
        includeProcess: false,
        includeRequire: false,
        includeRivet: false,
      },
    );

    assert.deepEqual(outputs, {
      output1: { type: 'string', value: 'done' },
    });
  });

  void it('supports require inside the worker', async () => {
    const runner = new AppExecutorWorkerCodeRunner();

    const outputs = await runner.runCode(
      `
        const path = require('node:path');
        return { output1: { type: 'string', value: path.basename('one/two.txt') } };
      `,
      {},
      {
        includeConsole: false,
        includeFetch: false,
        includeProcess: false,
        includeRequire: true,
        includeRivet: false,
      },
    );

    assert.deepEqual(outputs, {
      output1: { type: 'string', value: 'two.txt' },
    });
  });

  void it('passes inputs, graph inputs, and context values into the worker', async () => {
    const runner = new AppExecutorWorkerCodeRunner();

    const outputs = await runner.runCode(
      `
        return {
          output1: {
            type: 'string',
            value: [inputs.local.value, graphInputs.global.value, context.ctx.value].join('/'),
          },
        };
      `,
      {
        local: { type: 'string', value: 'input' },
      },
      {
        includeConsole: false,
        includeFetch: false,
        includeProcess: false,
        includeRequire: false,
        includeRivet: false,
      },
      {
        global: { type: 'string', value: 'graph' },
      },
      {
        ctx: { type: 'string', value: 'context' },
      },
    );

    assert.deepEqual(outputs, {
      output1: { type: 'string', value: 'input/graph/context' },
    });
  });

  void it('supports fetch inside the worker', async () => {
    const runner = new AppExecutorWorkerCodeRunner();

    const outputs = await runner.runCode(
      `
        const response = await fetch('data:text/plain,hello');
        return { output1: { type: 'string', value: await response.text() } };
      `,
      {},
      {
        includeConsole: false,
        includeFetch: true,
        includeProcess: false,
        includeRequire: false,
        includeRivet: false,
      },
    );

    assert.deepEqual(outputs, {
      output1: { type: 'string', value: 'hello' },
    });
  });

  void it('supports process inside the worker', async () => {
    const runner = new AppExecutorWorkerCodeRunner();

    const outputs = await runner.runCode(
      `return { output1: { type: 'string', value: process.release.name } };`,
      {},
      {
        includeConsole: false,
        includeFetch: false,
        includeProcess: true,
        includeRequire: false,
        includeRivet: false,
      },
    );

    assert.deepEqual(outputs, {
      output1: { type: 'string', value: 'node' },
    });
  });

  void it('bridges console output from the worker', async () => {
    const messages: unknown[][] = [];
    const runner = new AppExecutorWorkerCodeRunner((message) => {
      messages.push([message.level, ...message.args]);
    });

    const outputs = await runner.runCode(
      `
        console.log('worker log', { value: 1 });
        console.warn('worker warning');
        return { output1: { type: 'string', value: 'done' } };
      `,
      {},
      {
        includeConsole: true,
        includeFetch: false,
        includeProcess: false,
        includeRequire: false,
        includeRivet: false,
      },
    );

    assert.deepEqual(outputs, {
      output1: { type: 'string', value: 'done' },
    });
    assert.deepEqual(messages, [
      ['log', 'worker log', '{ value: 1 }'],
      ['warn', 'worker warning'],
    ]);
  });

  void it('falls back to current-thread execution for Rivet capability', async () => {
    const runner = new AppExecutorWorkerCodeRunner();

    const outputs = await runner.runCode(
      `return { output1: { type: 'boolean', value: typeof Rivet.createProcessor === 'function' } };`,
      {},
      {
        includeConsole: false,
        includeFetch: false,
        includeProcess: false,
        includeRequire: false,
        includeRivet: true,
      },
    );

    assert.deepEqual(outputs, {
      output1: { type: 'boolean', value: true },
    });
  });

  void it('bridges console output from the Rivet-capability fallback runner', async () => {
    const messages: unknown[][] = [];
    const runner = new AppExecutorWorkerCodeRunner((message) => {
      messages.push([message.level, ...message.args]);
    });

    const outputs = await runner.runCode(
      `
        console.info('fallback log', [1, 2]);
        return { output1: { type: 'boolean', value: typeof Rivet.createProcessor === 'function' } };
      `,
      {},
      {
        includeConsole: true,
        includeFetch: false,
        includeProcess: false,
        includeRequire: false,
        includeRivet: true,
      },
    );

    assert.deepEqual(outputs, {
      output1: { type: 'boolean', value: true },
    });
    assert.deepEqual(messages, [['info', 'fallback log', '[ 1, 2 ]']]);
  });

  void it('propagates worker errors with readable messages', async () => {
    const runner = new AppExecutorWorkerCodeRunner();

    await assert.rejects(
      () =>
        runner.runCode(
          `throw new TypeError('worker boom');`,
          {},
          {
            includeConsole: false,
            includeFetch: false,
            includeProcess: false,
            includeRequire: false,
            includeRivet: false,
          },
        ),
      (error) => error instanceof TypeError && error.message === 'worker boom',
    );
  });

  void it('lets independent graph nodes finish while synchronous code is still running', async () => {
    const graph: NodeGraph = {
      connections: [],
      metadata: {
        description: '',
        id: 'worker-timing-graph' as GraphId,
        name: 'Worker Timing Graph',
      },
      nodes: [
        makeCodeNode(`
          const end = Date.now() + 200;
          while (Date.now() < end) {}
          return { output1: { type: 'string', value: 'code done' } };
        `),
        makeTextNode(),
      ],
    };
    const processor = new GraphProcessor(makeProject(graph), graph.metadata!.id!, createBuiltInRegistry());
    processor.executor = 'nodejs';

    const finishedNodeIds: NodeId[] = [];
    const finishedOutputs: Record<string, Outputs> = {};
    processor.on('nodeFinish', ({ node, outputs }) => {
      finishedNodeIds.push(node.id);
      finishedOutputs[node.id] = outputs;
    });

    await processor.processGraph(testProcessContext());

    assert.equal(finishedNodeIds[0], 'text-node');
    assert.deepEqual(finishedOutputs['text-node']?.['output' as PortId], {
      type: 'string',
      value: 'ready',
    } satisfies DataValue);
    assert.deepEqual(finishedOutputs['code-node']?.['output1' as PortId], {
      type: 'string',
      value: 'code done',
    } satisfies DataValue);
  });

  void it('still lets the Code node validate returned output shape', async () => {
    const graph: NodeGraph = {
      connections: [],
      metadata: {
        description: '',
        id: 'worker-validation-graph' as GraphId,
        name: 'Worker Validation Graph',
      },
      nodes: [makeCodeNode(`return {};`)],
    };
    const processor = new GraphProcessor(makeProject(graph), graph.metadata!.id!, createBuiltInRegistry());
    processor.executor = 'nodejs';

    await assert.rejects(
      () => processor.processGraph(testProcessContext()),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error.cause instanceof Error);
        assert.match(error.cause.message, /Code node must return an object with output values for all outputs/);
        return true;
      },
    );
  });

  void it('preserves Code node error-location enrichment through worker errors', async () => {
    const graph: NodeGraph = {
      connections: [],
      metadata: {
        description: '',
        id: 'worker-error-location-graph' as GraphId,
        name: 'Worker Error Location Graph',
      },
      nodes: [
        makeCodeNode(
          [
            'const first = 1;',
            'const second = 2;',
            'const value = missingVariable;',
            'return { output1: { type: "number", value } };',
          ].join('\n'),
        ),
      ],
    };
    const processor = new GraphProcessor(makeProject(graph), graph.metadata!.id!, createBuiltInRegistry());
    processor.executor = 'nodejs';

    await assert.rejects(
      () => processor.processGraph(testProcessContext()),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(error.cause instanceof ReferenceError);
        assert.match(error.cause.message, /missingVariable is not defined/);
        assert.match(error.cause.message, /Code node line 3, column \d+/);
        return true;
      },
    );
  });
});
