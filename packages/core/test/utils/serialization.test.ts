import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import type { NodeGraph, Project } from '../../src/index.js';
import {
  deserializeGraph,
  deserializeProject,
  serializeGraph,
  serializeProject,
} from '../../src/utils/serialization/serialization.js';
import { graphV3Serializer } from '../../src/utils/serialization/serialization_v3.js';
import { detectSerializationVersion } from '../../src/utils/serialization/serializationUtils.js';
import {
  serializeConnection,
  deserializeConnection,
  parseVisualData,
  packVisualDataV3,
  packVisualDataV4,
} from '../../src/utils/serialization/serializationHelpers.js';

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

  it('serializes V3 graphs with a V3 envelope', () => {
    const serialized = graphV3Serializer(baseGraph) as string;

    assert.equal(detectSerializationVersion(serialized), 3);
  });

  it('round-trips project through V4 serialize/deserialize', () => {
    const projectWithConnections: Project = {
      metadata: {
        id: 'project-rt',
        title: 'Round Trip Test',
        description: 'Tests round-trip fidelity',
      },
      graphs: {
        'graph-rt': {
          metadata: { id: 'graph-rt', name: 'RT Graph', description: '' },
          nodes: [
            {
              id: 'n1',
              type: 'text',
              title: 'Text Node',
              visualData: { x: 100, y: 200, width: 300, zIndex: 5, color: { border: '#ff0000', bg: '#00ff00' } },
              data: { text: 'hello' },
              variants: [],
            },
            {
              id: 'n2',
              type: 'prompt',
              title: 'Prompt Node',
              visualData: { x: 400, y: 500 },
              data: {},
              variants: [],
            },
          ],
          connections: [
            { outputNodeId: 'n1', outputId: 'output', inputNodeId: 'n2', inputId: 'input' },
          ],
        },
      },
      plugins: [],
      references: [],
    };

    const attachedData = { custom: { key: 'value' } };
    const serialized = serializeProject(projectWithConnections, attachedData) as string;
    const [deserialized, deserializedAttached] = deserializeProject(serialized);

    assert.equal(deserialized.metadata.id, 'project-rt');
    assert.equal(deserialized.metadata.title, 'Round Trip Test');
    assert.deepEqual(deserializedAttached, attachedData);

    const graph = deserialized.graphs['graph-rt']!;
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.connections.length, 1);

    const n1 = graph.nodes.find((n) => n.id === 'n1')!;
    assert.equal(n1.visualData.x, 100);
    assert.equal(n1.visualData.color?.border, '#ff0000');
    assert.equal(n1.visualData.color?.bg, '#00ff00');
    assert.deepEqual(n1.data, { text: 'hello' });

    const conn = graph.connections[0]!;
    assert.equal(conn.outputNodeId, 'n1');
    assert.equal(conn.inputNodeId, 'n2');
  });

  it('round-trips graph through V4 serialize/deserialize', () => {
    const graph: NodeGraph = {
      metadata: { id: 'g1', name: 'Test', description: '' },
      nodes: [
        { id: 'a', type: 'text', title: 'A', visualData: { x: 0, y: 0 }, data: {}, variants: [] },
        { id: 'b', type: 'text', title: 'B', visualData: { x: 1, y: 1, width: 200, zIndex: 3 }, data: {}, variants: [] },
      ],
      connections: [
        { outputNodeId: 'a', outputId: 'out', inputNodeId: 'b', inputId: 'in' },
      ],
    };

    const serialized = serializeGraph(graph) as string;
    const deserialized = deserializeGraph(serialized);

    assert.equal(deserialized.nodes.length, 2);
    assert.equal(deserialized.connections.length, 1);
    assert.equal(deserialized.connections[0]!.outputNodeId, 'a');
    assert.equal(deserialized.connections[0]!.inputNodeId, 'b');
  });

  it('round-trips V4 graphs with empty node titles', () => {
    const graph: NodeGraph = {
      metadata: { id: 'g-empty-title', name: 'Test', description: '' },
      nodes: [
        { id: 'a', type: 'text', title: 'Named', visualData: { x: 0, y: 0 }, data: {}, variants: [] },
        { id: 'b', type: 'text', title: '', visualData: { x: 1, y: 1 }, data: {}, variants: [] },
      ],
      connections: [{ outputNodeId: 'a', outputId: 'out', inputNodeId: 'b', inputId: 'in' }],
    };

    const serialized = serializeGraph(graph) as string;
    const deserialized = deserializeGraph(serialized);

    assert.equal(deserialized.nodes.find((node) => node.id === 'b')?.title, '');
    assert.equal(deserialized.connections.length, 1);
    assert.equal(deserialized.connections[0]!.inputNodeId, 'b');
  });
});

describe('serialization helpers', () => {
  it('serializeConnection and deserializeConnection round-trip', () => {
    const nodes = [
      { id: 'n1', type: 'text', title: 'Source', visualData: { x: 0, y: 0 }, data: {}, variants: [] },
      { id: 'n2', type: 'text', title: 'Target Node', visualData: { x: 0, y: 0 }, data: {}, variants: [] },
    ] as any[];

    const connection = { outputNodeId: 'n1', outputId: 'out', inputNodeId: 'n2', inputId: 'in' } as any;
    const serialized = serializeConnection(connection, nodes);
    assert.equal(serialized, 'out->"Target Node" n2/in');

    const deserialized = deserializeConnection(serialized, 'n1' as any);
    assert.equal(deserialized.outputId, 'out');
    assert.equal(deserialized.outputNodeId, 'n1');
    assert.equal(deserialized.inputId, 'in');
    assert.equal(deserialized.inputNodeId, 'n2');
  });

  it('serializeConnection and deserializeConnection support empty target titles', () => {
    const nodes = [
      { id: 'n1', type: 'text', title: 'Source', visualData: { x: 0, y: 0 }, data: {}, variants: [] },
      { id: 'n2', type: 'text', title: '', visualData: { x: 0, y: 0 }, data: {}, variants: [] },
    ] as any[];

    const connection = { outputNodeId: 'n1', outputId: 'out', inputNodeId: 'n2', inputId: 'in' } as any;
    const serialized = serializeConnection(connection, nodes);
    assert.equal(serialized, 'out->"" n2/in');

    const deserialized = deserializeConnection(serialized, 'n1' as any);
    assert.equal(deserialized.outputNodeId, 'n1');
    assert.equal(deserialized.inputNodeId, 'n2');
    assert.equal(deserialized.inputId, 'in');
  });

  it('parseVisualData handles V3 format (4 parts)', () => {
    const result = parseVisualData('10/20/300/5');
    assert.equal(result.x, 10);
    assert.equal(result.y, 20);
    assert.equal(result.width, 300);
    assert.equal(result.zIndex, 5);
    assert.equal(result.borderColor, undefined);
    assert.equal(result.bgColor, undefined);
  });

  it('parseVisualData handles V4 format with colors (6 parts)', () => {
    const result = parseVisualData('10/20/null/null/#ff0000/#00ff00');
    assert.equal(result.x, 10);
    assert.equal(result.y, 20);
    assert.equal(result.width, undefined);
    assert.equal(result.zIndex, undefined);
    assert.equal(result.borderColor, '#ff0000');
    assert.equal(result.bgColor, '#00ff00');
  });

  it('parseVisualData handles V4 format with empty colors', () => {
    const result = parseVisualData('10/20/140/1//');
    assert.equal(result.x, 10);
    assert.equal(result.width, 140);
    assert.equal(result.borderColor, undefined);
    assert.equal(result.bgColor, undefined);
  });

  it('packVisualDataV3 packs correctly', () => {
    const node = { visualData: { x: 5, y: 10, width: 200, zIndex: 3 } } as any;
    assert.equal(packVisualDataV3(node), '5/10/200/3');
  });

  it('packVisualDataV4 packs with color fields', () => {
    const node = { visualData: { x: 5, y: 10, width: undefined, zIndex: undefined, color: { border: 'red', bg: 'blue' } } } as any;
    assert.equal(packVisualDataV4(node), '5/10/null/null/red/blue');
  });
});
