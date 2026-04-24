import {
  type NodeGraph,
  type Project,
  ExecutionRecorder,
  deserializeGraph,
  deserializeProject,
  serializeGraph,
  serializeProject,
} from '@ironclad/rivet-core';
import { type IOProvider } from './IOProvider.js';
import {
  type SerializedTrivetData,
  type TrivetData,
  deserializeTrivetData,
  serializeTrivetData,
} from '@ironclad/trivet';
import { openBrowserFile } from './browserFileInput.js';

export class BrowserIOProvider implements IOProvider {
  static isSupported(): boolean {
    return 'showSaveFilePicker' in window;
  }

  async saveGraphData(graphData: NodeGraph): Promise<void> {
    const fileHandle = await window.showSaveFilePicker();
    const writable = await fileHandle.createWritable();
    await writable.write(serializeGraph(graphData) as string);
    await writable.close();
  }

  async saveProjectData(project: Project, testData: TrivetData): Promise<string | undefined> {
    const fileHandle = await window.showSaveFilePicker();
    const writable = await fileHandle.createWritable();
    await writable.write(serializeProject(project, { trivet: serializeTrivetData(testData) }) as string);
    await writable.close();
    return fileHandle.name;
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
    const fileHandle = await window.showSaveFilePicker({ suggestedName: defaultFileName });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
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
