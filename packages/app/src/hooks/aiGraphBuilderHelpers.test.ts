import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBuiltInRegistry,
  type ExternalFunctionProcessContext,
  type GraphId,
  type NodeGraph,
  type Project,
  type ProjectId,
  type TextNode,
  type ExtractJsonNode,
} from '@ironclad/rivet-core';
import { buildAiGraphBuilderExternalFunctions } from './aiGraphBuilderHelpers';

test('getPorts only reports connections that belong to the requested node', async () => {
  const registry = createBuiltInRegistry();
  let workingGraph: NodeGraph = {
    metadata: { id: 'graph-1' as GraphId, name: 'Graph', description: '' },
    nodes: [],
    connections: [],
  };

  const nodeA = registry.createDynamic('text') as TextNode;
  nodeA.id = 'node-a' as any;
  nodeA.data.text = '{{input}}';

  const nodeB = registry.createDynamic('text') as TextNode;
  nodeB.id = 'node-b' as any;
  nodeB.data.text = '{{input}}';

  const nodeC = registry.createDynamic('extractJson') as ExtractJsonNode;
  nodeC.id = 'node-c' as any;

  const nodeD = registry.createDynamic('extractJson') as ExtractJsonNode;
  nodeD.id = 'node-d' as any;

  const context = {} as ExternalFunctionProcessContext;

  workingGraph = {
    ...workingGraph,
    nodes: [nodeA, nodeB, nodeC, nodeD],
    connections: [
      {
        outputNodeId: nodeA.id,
        outputId: 'output' as any,
        inputNodeId: nodeC.id,
        inputId: 'input' as any,
      },
      {
        outputNodeId: nodeB.id,
        outputId: 'output' as any,
        inputNodeId: nodeD.id,
        inputId: 'input' as any,
      },
    ],
  };

  const helpers = buildAiGraphBuilderExternalFunctions({
    project: {
      metadata: { id: 'project-1' as ProjectId, title: 'Project', description: '' },
      graphs: {},
      plugins: [],
    } as Project,
    referencedProjects: {},
    registry,
    showChanges: () => {},
    workingGraph: () => workingGraph,
    setWorkingGraph: (nextGraph) => {
      workingGraph = nextGraph;
    },
  });

  const ports = (await helpers.getPorts?.(context, nodeC.id)) as { type: 'object'; value: any };
  const inputPort = ports.value.inputs.find((input: any) => input.definition.id === 'input');

  assert.equal(inputPort.connectedTo.outputNodeId, nodeA.id);
  assert.equal(inputPort.connectedTo.inputNodeId, nodeC.id);

  const outputPorts = (await helpers.getPorts?.(context, nodeA.id)) as { type: 'object'; value: any };
  const outputPort = outputPorts.value.outputs.find((output: any) => output.definition.id === 'output');

  assert.equal(outputPort.connectedTo.length, 1);
  assert.equal(outputPort.connectedTo[0].inputNodeId, nodeC.id);
});
