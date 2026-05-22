import type { Project, NodeGraph } from '../../index.js';
import { doubleCheckProject } from './serializationUtils.js';
// @ts-ignore
import * as yaml from 'yaml';

export function projectV2Deserializer(data: unknown): Project {
  const project = unwrapV2Envelope<Project>(data, 'Project v2');

  if (project.version !== 2) {
    throw new Error('Project v2 deserializer requires a version 2 project');
  }

  doubleCheckProject(project.data);

  return project.data;
}

export function graphV2Deserializer(data: unknown): NodeGraph {
  const graph = unwrapV2Envelope<NodeGraph>(data, 'Graph v2');

  if (graph.version !== 2) {
    throw new Error('Graph v2 deserializer requires a version 2 graph');
  }

  return graph.data;
}

function unwrapV2Envelope<T>(data: unknown, label: string): { version: number; data: T } {
  if (typeof data !== 'string' && (!data || typeof data !== 'object' || Array.isArray(data))) {
    throw new Error(`${label} deserializer requires a string`);
  }

  return (typeof data === 'string' ? yaml.parse(data) : data) as { version: number; data: T };
}
