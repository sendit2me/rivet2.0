import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { loadTestGraphs } from './testUtils';
import {
  CodeNodeImpl,
  createProcessor,
  type CodeRunner,
  type GraphId,
  type NodeGraph,
  type NodeId,
  type Outputs,
  type PortId,
  type Project,
} from '../src/index.js';

function makeCodeProject(code: string): Project {
  const codeNode = CodeNodeImpl.create();
  codeNode.id = 'code-node' as NodeId;
  codeNode.data = {
    ...codeNode.data,
    allowProcess: true,
    code,
    inputNames: [],
    outputNames: ['output1'],
  };

  const graph: NodeGraph = {
    connections: [],
    metadata: {
      description: '',
      id: 'code-graph' as GraphId,
      name: 'Code Graph',
    },
    nodes: [codeNode],
  };

  return {
    graphs: {
      [graph.metadata!.id!]: graph,
    },
    metadata: {
      id: 'node-api-test-project' as GraphId,
      mainGraphId: graph.metadata!.id,
      title: 'Node API Test Project',
    },
  } as Project;
}

describe('api', () => {
  it('can stream processor events', async () => {
    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
    });

    void processor.run();

    const eventNames: string[] = [];
    for await (const event of processor.getEvents({ done: true, nodeStart: true, nodeFinish: true })) {
      eventNames.push(event.type);
    }

    // 3 nodes start and finish + done
    assert.deepEqual(eventNames, [
      'nodeStart',
      'nodeFinish',
      'nodeStart',
      'nodeFinish',
      'nodeStart',
      'nodeFinish',
      'done',
    ]);
  });

  it('can easily filter for a node', async () => {
    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
    });

    void processor.run();

    for await (const event of processor.getEvents({ nodeStart: ['Passthrough'] })) {
      assert.equal(event.type, 'nodeStart');
    }
  });

  it('Can get an event stream for a processor', async () => {
    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
    });

    void processor.run();

    const reader = processor
      .getSSEStream({
        nodeFinish: true,
      })
      .getReader();

    const decoder = new TextDecoder();

    // Kind of a mess but whatev
    const eventNames: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const data = decoder.decode(value);

      const event = /event: (?<event>.*)/.exec(data)!.groups!.event!;
      eventNames.push(event);
    }

    assert.deepEqual(eventNames, ['nodeFinish', 'nodeFinish', 'nodeFinish']);
  });

  it('passes remote debugger request ids through attach', async () => {
    let attachedRequestId: string | undefined;

    const remoteDebugger = {
      on: () => undefined,
      off: () => undefined,
      webSocketServer: {} as never,
      broadcast: () => undefined,
      attach: (_processor: unknown, requestId?: string) => {
        attachedRequestId = requestId;
      },
      detach: () => undefined,
    };

    createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
      remoteDebugger,
      remoteDebuggerRequestId: 'request-123',
    });

    assert.equal(attachedRequestId, 'request-123');
  });

  it('keeps the default programmatic Code runner behavior', async () => {
    let codeOutput: Outputs | undefined;
    const processor = createProcessor(
      makeCodeProject(`return { output1: { type: 'string', value: process.release.name } };`),
      {
        graph: 'code-graph',
        onNodeFinish: ({ outputs }) => {
          codeOutput = outputs;
        },
      },
    );

    await processor.run();

    assert.deepEqual(codeOutput?.['output1' as PortId], {
      type: 'string',
      value: 'node',
    });
  });

  it('keeps custom programmatic Code runners opt-in and unchanged', async () => {
    let runCount = 0;
    const customCodeRunner: CodeRunner = {
      async runCode() {
        runCount += 1;
        return {
          output1: {
            type: 'string',
            value: 'custom runner',
          },
        };
      },
    };
    let codeOutput: Outputs | undefined;

    const processor = createProcessor(
      makeCodeProject(`throw new Error('the custom runner should replace this code');`),
      {
        codeRunner: customCodeRunner,
        graph: 'code-graph',
        onNodeFinish: ({ outputs }) => {
          codeOutput = outputs;
        },
      },
    );

    await processor.run();

    assert.equal(runCount, 1);
    assert.deepEqual(codeOutput?.['output1' as PortId], {
      type: 'string',
      value: 'custom runner',
    });
  });
});
