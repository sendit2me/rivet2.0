import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { preprocessGraphState, toReusableGraphExecutionPlan } from '../../src/model/GraphPreprocessor';

describe('GraphPreprocessor', () => {
  it('drops invalid connections and preserves cycle metadata', () => {
    const inputDefinition = [{ id: 'input', title: 'Input', dataType: 'string', required: false }];
    const outputDefinition = [{ id: 'output', title: 'Output', dataType: 'string' }];
    const registry = {
      createDynamicImpl: () => ({
        getInputDefinitionsIncludingBuiltIn: () => inputDefinition,
        getOutputDefinitions: () => outputDefinition,
      }),
    };

    const graph = {
      metadata: { id: 'graph-1' },
      nodes: [
        { id: 'a', type: 'stub', title: 'A', visualData: { x: 0, y: 0 } },
        { id: 'b', type: 'stub', title: 'B', visualData: { x: 10, y: 10 } },
      ],
      connections: [
        { inputNodeId: 'b', inputId: 'input', outputNodeId: 'a', outputId: 'output' },
        { inputNodeId: 'missing', inputId: 'input', outputNodeId: 'a', outputId: 'output' },
      ],
    };

    const result = preprocessGraphState({
      buildExecutionPlan: true,
      graph: graph as any,
      loadedProjects: {},
      project: { metadata: { id: 'project-1', title: 'Project' }, graphs: {} } as any,
      registry: registry as any,
      warnOnInvalidGraph: false,
    });

    assert.equal(result.connections.a?.length, 1);
    assert.equal(result.connections.b?.length, 1);
    assert.equal(result.connections.missing, undefined);
    assert.equal(result.stronglyConnectedComponents.length, 2);
    assert.equal(result.definitions.a?.inputs.length, 1);
    assert.equal(result.definitions.a?.outputs.length, 1);
    assert.deepEqual(
      result.inputConnectionsByNode.b.map((connection) => connection.inputId),
      ['input'],
    );
    assert.deepEqual(
      result.outputNodeResultsByNode.a.nodes.map((node) => node.id),
      ['b'],
    );
    assert.equal(result.inputConnectionByNodeAndPort.b?.input?.outputNodeId, 'a');
    assert.deepEqual(
      result.outputConnectionsByNodeAndPort.a?.output?.map((connection) => connection.inputNodeId),
      ['b'],
    );
    assert.deepEqual(result.missingRequiredInputsByNode.b, []);
    assert.deepEqual(
      result.startNodes.map((node) => node.id),
      ['b'],
    );
    assert.equal('nodeInstances' in toReusableGraphExecutionPlan(result), false);
  });
});
