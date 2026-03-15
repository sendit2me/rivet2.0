import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import type { NodeGraph, Project } from '../../src/index.js';
import {
  deserializeGraph,
  deserializeProject,
  serializeProject,
} from '../../src/utils/serialization/serialization.js';
import { detectSerializationVersion } from '../../src/utils/serialization/serializationUtils.js';

const baseGraph: NodeGraph = {
  metadata: {
    id: 'graph-1',
    name: 'Main Graph',
    description: 'Test graph',
  },
  nodes: [
    {
      id: 'node-1',
      type: 'graphInput',
      title: 'Input',
      visualData: {
        x: 10,
        y: 20,
        width: 140,
        zIndex: 1,
      },
      data: {},
      variants: [],
    },
  ],
  connections: [],
};

const baseProject: Project = {
  metadata: {
    id: 'project-1',
    title: 'Serialization Test',
    description: 'Project fixture',
  },
  graphs: {
    'graph-1': baseGraph,
  },
  plugins: [],
  references: [],
};

const v1Project = JSON.stringify(baseProject);

const v2Project = `version: 2
data:
  metadata:
    id: project-1
    title: Serialization Test
    description: Project fixture
  graphs:
    graph-1:
      metadata:
        id: graph-1
        name: Main Graph
        description: Test graph
      nodes:
        - id: node-1
          type: graphInput
          title: Input
          visualData:
            x: 10
            y: 20
            width: 140
            zIndex: 1
          data: {}
          variants: []
      connections: []
`;

const v3Project = `version: 3
data:
  metadata:
    id: project-1
    title: Serialization Test
    description: Project fixture
  graphs:
    graph-1:
      metadata:
        id: graph-1
        name: Main Graph
        description: Test graph
      nodes:
        node-1:
          id: node-1
          type: graphInput
          title: Input
          visualData: 10/20/140/1
          outgoingConnections: []
`;

const v1Graph = JSON.stringify(baseGraph);

const v2Graph = `version: 2
data:
  metadata:
    id: graph-1
    name: Main Graph
    description: Test graph
  nodes:
    - id: node-1
      type: graphInput
      title: Input
      visualData:
        x: 10
        y: 20
        width: 140
        zIndex: 1
      data: {}
      variants: []
  connections: []
`;

const v3Graph = `version: 3
data:
  metadata:
    id: graph-1
    name: Main Graph
    description: Test graph
  nodes:
    node-1:
      id: node-1
      type: graphInput
      title: Input
      visualData: 10/20/140/1
      outgoingConnections: []
`;

const v4Graph = `version: 4
data:
  metadata:
    id: graph-1
    name: Main Graph
    description: Test graph
  nodes:
    "[node-1]:graphInput \\"Input\\"":
      visualData: 10/20/140/1//
`;

describe('serialization compatibility', () => {
  it('detects legacy and current serialization versions explicitly', () => {
    assert.equal(detectSerializationVersion(v1Project), 1);
    assert.equal(detectSerializationVersion(v2Project), 2);
    assert.equal(detectSerializationVersion(v3Project), 3);
    assert.equal(detectSerializationVersion(v4Graph), 4);
  });

  it('deserializes project formats v1 through v4', () => {
    const [projectV1] = deserializeProject(v1Project);
    const [projectV2] = deserializeProject(v2Project);
    const [projectV3] = deserializeProject(v3Project);
    const [projectV4, attachedDataV4] = deserializeProject(
      serializeProject(baseProject, { pluginState: { enabled: true } }) as string,
    );

    assert.equal(projectV1.metadata.title, baseProject.metadata.title);
    assert.equal(projectV2.metadata.title, baseProject.metadata.title);
    assert.equal(projectV3.metadata.title, baseProject.metadata.title);
    assert.equal(projectV4.metadata.title, baseProject.metadata.title);
    assert.deepEqual(attachedDataV4, { pluginState: { enabled: true } });
  });

  it('deserializes graph formats v1 through v4', () => {
    const graph1 = deserializeGraph(v1Graph);
    const graph2 = deserializeGraph(v2Graph);
    const graph3 = deserializeGraph(v3Graph);
    const graph4 = deserializeGraph(v4Graph);

    for (const graph of [graph1, graph2, graph3, graph4]) {
      assert.equal(graph.metadata?.id, 'graph-1');
      assert.equal(graph.nodes[0]?.id, 'node-1');
      assert.equal(graph.nodes[0]?.title, 'Input');
      assert.equal(graph.connections.length, 0);
    }
  });
});
