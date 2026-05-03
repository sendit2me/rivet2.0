import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deserializeProject, type GraphId, type Project, type ProjectId } from '@rivet2/rivet-core';
import { serializeTemplateProject } from './communityTemplates.js';

const graphAId = 'graph-a' as GraphId;
const graphBId = 'graph-b' as GraphId;

function createProject(): Project {
  return {
    metadata: {
      id: 'project-1' as ProjectId,
      title: 'Template Serialization Test',
      description: 'Project used for template serialization tests',
      mainGraphId: graphAId,
    },
    graphs: {
      [graphAId]: {
        metadata: {
          id: graphAId,
          name: 'Graph A',
          description: 'Primary graph',
        },
        nodes: [],
        connections: [],
      },
      [graphBId]: {
        metadata: {
          id: graphBId,
          name: 'Graph B',
          description: 'Secondary graph',
        },
        nodes: [],
        connections: [],
      },
    },
    plugins: [],
    references: [],
  };
}

describe('communityTemplates', () => {
  test('serializeTemplateProject only includes selected graphs', () => {
    const serialized = serializeTemplateProject(createProject(), [graphBId]);
    const [deserialized] = deserializeProject(serialized);

    assert.deepEqual(Object.keys(deserialized.graphs), [graphBId]);
    assert.equal(deserialized.graphs[graphBId]?.metadata?.name, 'Graph B');
    assert.equal(deserialized.metadata.mainGraphId, undefined);
  });

  test('serializeTemplateProject preserves the main graph when it is selected', () => {
    const serialized = serializeTemplateProject(createProject(), [graphAId]);
    const [deserialized] = deserializeProject(serialized);

    assert.deepEqual(Object.keys(deserialized.graphs), [graphAId]);
    assert.equal(deserialized.metadata.mainGraphId, graphAId);
  });
});
