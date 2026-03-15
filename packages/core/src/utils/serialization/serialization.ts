// @ts-ignore
import * as yaml from 'yaml';
import { graphV3Deserializer, projectV3Deserializer } from './serialization_v3.js';
import type { Project, NodeGraph, Dataset, DatasetMetadata } from '../../index.js';
import { getError } from '../errors.js';
import { detectSerializationVersion, type AttachedData, yamlProblem } from './serializationUtils.js';
import {
  datasetV4Deserializer,
  datasetV4Serializer,
  graphV4Deserializer,
  graphV4Serializer,
  projectV4Deserializer,
  projectV4Serializer,
} from './serialization_v4.js';
import { graphV2Deserializer, projectV2Deserializer } from './serialization_v2.js';
import { graphV1Deserializer, projectV1Deserializer } from './serialization_v1.js';

export function serializeProject(project: Project, attachedData?: AttachedData): unknown {
  return projectV4Serializer(project, attachedData);
}

const errMessage = (err: unknown) => `${getError(err).message}\n${getError(err).stack}`;

export function deserializeProject(serializedProject: unknown, path: string | null = null): [Project, AttachedData] {
  const version = detectSerializationVersion(serializedProject);

  try {
    const result = deserializeProjectByVersion(serializedProject, version);
    if (path !== null) {
      result[0].metadata.path = path;
    }
    return result;
  } catch (err) {
    if (err instanceof yaml.YAMLError) {
      yamlProblem(err);
    }
    console.warn(`Failed to deserialize project v${version}: ${errMessage(err)}`);
    throw new Error('Could not deserialize project');
  }
}

export function serializeGraph(graph: NodeGraph): unknown {
  return graphV4Serializer(graph);
}

export function deserializeGraph(serializedGraph: unknown): NodeGraph {
  const version = detectSerializationVersion(serializedGraph);

  try {
    return deserializeGraphByVersion(serializedGraph, version);
  } catch (err) {
    if (err instanceof yaml.YAMLError) {
      yamlProblem(err);
    }
    console.warn(`Failed to deserialize graph v${version}: ${errMessage(err)}`);
    throw new Error('Could not deserialize graph');
  }
}

function deserializeProjectByVersion(
  serializedProject: unknown,
  version: ReturnType<typeof detectSerializationVersion>,
): [Project, AttachedData] {
  switch (version) {
    case 4:
      return projectV4Deserializer(serializedProject);
    case 3:
      return [projectV3Deserializer(serializedProject), {}];
    case 2:
      return [projectV2Deserializer(serializedProject), {}];
    case 1:
    default:
      return [projectV1Deserializer(serializedProject), {}];
  }
}

function deserializeGraphByVersion(
  serializedGraph: unknown,
  version: ReturnType<typeof detectSerializationVersion>,
): NodeGraph {
  switch (version) {
    case 4:
      return graphV4Deserializer(serializedGraph);
    case 3:
      return graphV3Deserializer(serializedGraph);
    case 2:
      return graphV2Deserializer(serializedGraph);
    case 1:
    default:
      return graphV1Deserializer(serializedGraph);
  }
}

export type CombinedDataset = {
  meta: DatasetMetadata;
  data: Dataset;
};

export function serializeDatasets(datasets: CombinedDataset[]): string {
  return datasetV4Serializer(datasets);
}

export function deserializeDatasets(serializedDatasets: string): CombinedDataset[] {
  return datasetV4Deserializer(serializedDatasets);
}
