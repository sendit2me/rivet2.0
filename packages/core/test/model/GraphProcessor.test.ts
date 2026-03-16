import { it, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { GraphProcessor, globalRivetNodeRegistry } from '../../src/index.js';
import { loadTestGraphInProcessor, testProcessContext } from '../testUtils';

function makeProject(graph: any) {
  return {
    metadata: {
      id: 'project-1',
      title: 'Project',
      description: '',
      mainGraphId: graph.metadata.id,
    },
    graphs: {
      [graph.metadata.id]: graph,
    },
    plugins: [],
  } as any;
}

void describe('GraphProcessor', () => {
  void it('Can run passthrough graph', async () => {
    const processor = await loadTestGraphInProcessor('Passthrough');

    const outputs = await processor.processGraph(testProcessContext(), {
      input: {
        type: 'string',
        value: 'input value',
      },
    });

    assert.deepEqual(outputs.output, {
      type: 'string',
      value: 'input value',
    });
  });

  void it('Can stream graph processor events', async () => {
    const processor = await loadTestGraphInProcessor('Passthrough');

    void processor.processGraph(testProcessContext(), {
      input: {
        type: 'string',
        value: 'input value',
      },
    });

    const eventNames: string[] = [];
    for await (const event of processor.events()) {
      if (event.type !== 'trace') {
        eventNames.push(event.type);
      }
    }

    assert.equal(eventNames[eventNames.length - 2], 'done');
    assert.equal(eventNames[eventNames.length - 1], 'finish');
  });

  void it('emits finish once for a successful run', async () => {
    const processor = await loadTestGraphInProcessor('Passthrough');
    let finishCount = 0;

    processor.on('finish', () => {
      finishCount += 1;
    });

    await processor.processGraph(testProcessContext(), {
      input: {
        type: 'string',
        value: 'input value',
      },
    });

    assert.equal(finishCount, 1);
  });

  void it('can resolve dependency nodes before processing and through cycles', () => {
    const graph = {
      metadata: {
        id: 'cycle-graph',
        name: 'Cycle Graph',
        description: '',
      },
      nodes: [
        {
          id: 'node-a',
          type: 'passthrough',
          title: 'Node A',
          data: {},
          visualData: { x: 0, y: 0, width: 175 },
        },
        {
          id: 'node-b',
          type: 'passthrough',
          title: 'Node B',
          data: {},
          visualData: { x: 250, y: 0, width: 175 },
        },
      ],
      connections: [
        {
          outputNodeId: 'node-a',
          outputId: 'output1',
          inputNodeId: 'node-b',
          inputId: 'input1',
        },
        {
          outputNodeId: 'node-b',
          outputId: 'output1',
          inputNodeId: 'node-a',
          inputId: 'input1',
        },
      ],
    };

    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id, globalRivetNodeRegistry);

    assert.deepEqual(new Set(processor.getDependencyNodesDeep('node-a' as any)), new Set(['node-a', 'node-b']));
  });

  void it('uses the latest context values for each run', async () => {
    const graph = {
      metadata: {
        id: 'context-graph',
        name: 'Context Graph',
        description: '',
      },
      nodes: [
        {
          id: 'context-node',
          type: 'context',
          title: 'Context',
          data: {
            id: 'greeting',
            dataType: 'string',
            useDefaultValueInput: false,
          },
          visualData: { x: 0, y: 0, width: 300 },
        },
        {
          id: 'output-node',
          type: 'graphOutput',
          title: 'Graph Output',
          data: {
            id: 'output',
            dataType: 'string',
          },
          visualData: { x: 250, y: 0, width: 300 },
        },
      ],
      connections: [
        {
          outputNodeId: 'context-node',
          outputId: 'data',
          inputNodeId: 'output-node',
          inputId: 'value',
        },
      ],
    };

    const processor = new GraphProcessor(makeProject(graph), graph.metadata.id, globalRivetNodeRegistry);

    const firstOutputs = await processor.processGraph(testProcessContext(), {}, {
      greeting: { type: 'string', value: 'hello' },
    });
    const secondOutputs = await processor.processGraph(testProcessContext(), {}, {
      greeting: { type: 'string', value: 'goodbye' },
    });

    assert.deepEqual(firstOutputs.output, { type: 'string', value: 'hello' });
    assert.deepEqual(secondOutputs.output, { type: 'string', value: 'goodbye' });
  });

  void it('aborting a paused graph does not hang the run promise', async () => {
    const processor = await loadTestGraphInProcessor('Passthrough');

    processor.pause();

    const runOutcome = processor
      .processGraph(testProcessContext(), {
        input: {
          type: 'string',
          value: 'input value',
        },
      })
      .then(
        () => 'resolved',
        (error) => `rejected:${(error as Error).message}`,
      );

    setTimeout(() => {
      void processor.abort(false, 'graph execution aborted');
    }, 10);

    const outcome = await Promise.race([
      runOutcome,
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 500)),
    ]);

    assert.equal(outcome, 'rejected:graph execution aborted');
  });
});
