import {
  type NodeGraph,
  type Project,
  ExecutionRecorder,
  deserializeGraph,
  deserializeProject,
  serializeGraph,
  serializeProject,
} from '@valerypopoff/rivet2-core';
import { type IOProvider } from './IOProvider.js';
import {
  type SerializedTrivetData,
  type TrivetData,
  deserializeTrivetData,
  serializeTrivetData,
} from '@valerypopoff/trivet';
import { openBrowserFile } from './browserFileInput.js';

export class LegacyBrowserIOProvider implements IOProvider {
  async saveGraphData(graphData: NodeGraph): Promise<void> {
    const serializedData = serializeGraph(graphData);
    const blob = new Blob([serializedData as string], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'graph.rivet-graph';
    link.click();
  }

  async saveProjectData(project: Project, testData: TrivetData): Promise<string | undefined> {
    const serializedData = serializeProject(project, { trivet: serializeTrivetData(testData) });
    const blob = new Blob([serializedData as string], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'project.rivet-project';
    link.click();
    return link.download;
  }

  async loadGraphData(callback: (graphData: NodeGraph) => void): Promise<void> {
    const file = await openBrowserFile({ accept: '.rivet-graph' });
    if (!file) return;

    const text = await file.text();
    callback(deserializeGraph(text));
  }

  async loadProjectData(
    callback: (data: { project: Project; testData: TrivetData; path: string }) => void,
  ): Promise<void> {
    const file = await openBrowserFile({ accept: '.rivet-project' });
    if (!file) return;

    const text = await file.text();

    const [project, attachedData] = deserializeProject(text);

    const testData = attachedData?.trivet
      ? deserializeTrivetData(attachedData.trivet as SerializedTrivetData)
      : { testSuites: [] };

    callback({ project, testData, path: file.name });
  }

  async loadRecordingData(callback: (data: { recorder: ExecutionRecorder; path: string }) => void): Promise<void> {
    const file = await openBrowserFile({ accept: '.rivet-recording' });
    if (!file) return;

    const text = await file.text();
    callback({ recorder: ExecutionRecorder.deserializeFromString(text), path: file.name });
  }

  async saveString(content: string, defaultFileName: string): Promise<void> {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFileName;
    link.click();
  }

  async readFileAsString(callback: (data: string, fileName: string) => void): Promise<void> {
    const file = await openBrowserFile();
    if (!file) return;

    const text = await file.text();
    callback(text, file.name);
  }

  async readFileAsBinary(callback: (data: Uint8Array, fileName: string) => void): Promise<void> {
    const file = await openBrowserFile();
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    callback(new Uint8Array(arrayBuffer), file.name);
  }
}
