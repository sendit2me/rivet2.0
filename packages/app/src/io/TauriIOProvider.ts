import {
  ExecutionRecorder,
  type NodeGraph,
  type Project,
  deserializeGraph,
  deserializeProject,
  serializeGraph,
  serializeProject,
} from '@ironclad/rivet-core';
import { type PathBasedIOProvider } from './IOProvider.js';
import { isInTauri } from '../utils/tauri.js';
import {
  type SerializedTrivetData,
  type TrivetData,
  deserializeTrivetData,
  serializeTrivetData,
} from '@ironclad/trivet';
import { saveDatasetsFile, loadDatasetsFile } from './datasets.js';
import { nativeReadBinaryFile, nativeReadTextFile, nativeWriteFile, openDialog, saveDialog } from '../utils/nativeApp';

export class TauriIOProvider implements PathBasedIOProvider {
  static isSupported(): boolean {
    return isInTauri();
  }

  async saveGraphData(graphData: NodeGraph) {
    const filePath = await saveDialog({
      filters: [
        {
          name: 'Rivet Graph',
          extensions: ['rivet-graph'],
        },
      ],
      title: 'Save graph',
      defaultPath: `${graphData.metadata?.name ?? 'graph'}.rivet-graph`,
    });

    const data = serializeGraph(graphData) as string;

    if (filePath) {
      await nativeWriteFile({
        contents: data,
        path: filePath,
      });
    }
  }

  async saveProjectData(project: Project, testData: TrivetData) {
    const filePath = await saveDialog({
      filters: [
        {
          name: 'Rivet Project',
          extensions: ['rivet-project'],
        },
      ],
      title: 'Save project',
      defaultPath: `${project.metadata?.title ?? 'project'}.rivet-project`,
    });

    const data = serializeProject(project, {
      trivet: serializeTrivetData(testData),
    }) as string;

    if (filePath) {
      await nativeWriteFile({
        contents: data,
        path: filePath,
      });

      await saveDatasetsFile(filePath, project);

      return filePath;
    }

    return undefined;
  }

  async saveProjectDataNoPrompt(project: Project, testData: TrivetData, path: string) {
    const data = serializeProject(project, {
      trivet: serializeTrivetData(testData),
    }) as string;

    await nativeWriteFile({
      contents: data,
      path,
    });

    await saveDatasetsFile(path, project);
  }

  async loadGraphData(callback: (graphData: NodeGraph) => void) {
    const path = await openDialog({
      filters: [
        {
          name: 'Rivet Graph',
          extensions: ['rivet-graph'],
        },
      ],
      multiple: false,
      directory: false,
      recursive: false,
      title: 'Open graph',
    });

    if (path) {
      const data = await nativeReadTextFile(path as string);
      const graphData = deserializeGraph(data);
      callback(graphData);
    }
  }

  async loadProjectData(callback: (data: { project: Project; testData: TrivetData; path: string }) => void) {
    const path = (await openDialog({
      filters: [
        {
          name: 'Rivet Project',
          extensions: ['rivet-project'],
        },
      ],
      multiple: false,
      directory: false,
      recursive: false,
      title: 'Open graph',
    })) as string | undefined;

    if (path) {
      const projectData = await this.loadProjectDataNoPrompt(path);
      callback({ ...projectData, path });
    }
  }

  async loadProjectDataNoPrompt(path: string): Promise<{ project: Project; testData: TrivetData }> {
    const data = await nativeReadTextFile(path);
    const [projectData, attachedData] = deserializeProject(data, path);

    const trivetData = attachedData.trivet
      ? deserializeTrivetData(attachedData.trivet as SerializedTrivetData)
      : { testSuites: [] };

    await loadDatasetsFile(path, projectData);

    return { project: projectData, testData: trivetData };
  }

  async loadRecordingData(callback: (data: { recorder: ExecutionRecorder; path: string }) => void) {
    const path = await openDialog({
      filters: [
        {
          name: 'Rivet Recording',
          extensions: ['rivet-recording'],
        },
      ],
      multiple: false,
      directory: false,
      recursive: false,
      title: 'Open recording',
    });

    if (path) {
      const data = await nativeReadTextFile(path as string);
      const recorder = ExecutionRecorder.deserializeFromString(data);
      callback({ recorder, path: path as string });
    }
  }

  async openDirectory() {
    const path = await openDialog({
      filters: [],
      multiple: false,
      directory: true,
      recursive: true,
      title: 'Choose Directory',
    });

    return path;
  }

  async openFilePath() {
    const path = await openDialog({
      filters: [],
      multiple: false,
      directory: false,
      recursive: false,
      title: 'Choose File',
    });

    return path as string;
  }

  async saveString(content: string, defaultFileName: string) {
    const path = await saveDialog({
      filters: [],
      title: 'Save File',
      defaultPath: defaultFileName,
    });

    if (path) {
      await nativeWriteFile({
        contents: content,
        path,
      });
    }
  }

  async readFileAsString(callback: (data: string, fileName: string) => void): Promise<void> {
    const path = await openDialog({
      multiple: false,
    });

    if (path) {
      const fileName = (path as string).split('/').pop() as string;

      const contents = await nativeReadTextFile(path as string);
      callback(contents, fileName);
    }
  }

  async readFileAsBinary(callback: (data: Uint8Array, fileName: string) => void): Promise<void> {
    const path = await openDialog({
      multiple: false,
    });

    if (path) {
      const fileName = (path as string).split('/').pop() as string;

      const contents = await nativeReadBinaryFile(path as string);
      callback(contents, fileName);
    }
  }

  async readPathAsString(path: string): Promise<string> {
    const contents = await nativeReadTextFile(path);
    return contents;
  }

  async readPathAsBinary(path: string): Promise<Uint8Array> {
    const contents = await nativeReadBinaryFile(path);
    return contents;
  }
}
