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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rivet-graph';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement)!.files![0]!;
      const text = await file.text();
      callback(deserializeGraph(text));
    };
    input.click();
  }

  async loadProjectData(
    callback: (data: { project: Project; testData: TrivetData; path: string }) => void,
  ): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rivet-project';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement)!.files![0]!;
      const text = await file.text();

      const [project, attachedData] = deserializeProject(text);

      const testData = attachedData?.trivet
        ? deserializeTrivetData(attachedData.trivet as SerializedTrivetData)
        : { testSuites: [] };

      callback({ project, testData, path: file.name });
    };
    input.click();
  }

  async loadRecordingData(callback: (data: { recorder: ExecutionRecorder; path: string }) => void): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rivet-recording';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement)!.files![0]!;
      const text = await file.text();
      callback({ recorder: ExecutionRecorder.deserializeFromString(text), path: file.name });
    };
    input.click();
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
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement)!.files![0]!;
      const text = await file.text();
      callback(text, file.name);
    };
    input.click();
  }

  async readFileAsBinary(callback: (data: Uint8Array, fileName: string) => void): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement)!.files![0]!;
      const reader = new FileReader();
      reader.onload = () => {
        callback(new Uint8Array(reader.result as ArrayBuffer), file.name);
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  }
}
