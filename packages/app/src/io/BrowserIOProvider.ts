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

const PROJECT_FILE_EXTENSION = '.rivet-project';
const PROJECT_FILE_HANDLE_PATH_PREFIX = 'browser-project-handle';

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error != null && 'name' in error && error.name === 'AbortError';
}

async function writeProjectFile(fileHandle: FileSystemFileHandle, project: Project, testData: TrivetData): Promise<void> {
  const writable = await fileHandle.createWritable();
  await writable.write(serializeProject(project, { trivet: serializeTrivetData(testData) }) as string);
  await writable.close();
}

export class BrowserIOProvider implements IOProvider {
  readonly #projectFileHandles = new Map<string, FileSystemFileHandle>();
  #nextProjectFileHandleId = 0;

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
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: `${project.metadata?.title ?? 'project'}${PROJECT_FILE_EXTENSION}`,
      types: [
        {
          description: 'Rivet Project',
          accept: {
            'application/json': [PROJECT_FILE_EXTENSION],
          },
        },
      ],
    });

    await writeProjectFile(fileHandle, project, testData);

    return this.rememberProjectFileHandle(fileHandle);
  }

  canSaveProjectDataNoPrompt(path: string): boolean {
    return this.#projectFileHandles.has(path);
  }

  async saveProjectDataNoPrompt(project: Project, testData: TrivetData, path: string): Promise<void> {
    const fileHandle = this.#projectFileHandles.get(path);

    if (!fileHandle) {
      throw new Error('Browser project file handle is not available. Use Save project as... to choose a save target.');
    }

    await writeProjectFile(fileHandle, project, testData);
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
    const projectFile = await this.openProjectFile();
    if (!projectFile) return;

    const text = await projectFile.file.text();

    const [project, attachedData] = deserializeProject(text);

    const testData = attachedData?.trivet
      ? deserializeTrivetData(attachedData.trivet as SerializedTrivetData)
      : { testSuites: [] };

    callback({ project, testData, path: projectFile.path });
  }

  private async openProjectFile(): Promise<{ file: File; path: string } | undefined> {
    const projectFileFromPicker = await this.openProjectFileWithHandle();
    if (projectFileFromPicker !== 'fallback') {
      return projectFileFromPicker;
    }

    const file = await openBrowserFile({ accept: PROJECT_FILE_EXTENSION });
    return file ? { file, path: file.name } : undefined;
  }

  private async openProjectFileWithHandle(): Promise<{ file: File; path: string } | undefined | 'fallback'> {
    if (!('showOpenFilePicker' in window)) {
      return 'fallback';
    }

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Rivet Project',
            accept: {
              'application/json': [PROJECT_FILE_EXTENSION],
            },
          },
        ],
      });

      if (!fileHandle) {
        return undefined;
      }

      const file = await fileHandle.getFile();
      return { file, path: this.rememberProjectFileHandle(fileHandle) };
    } catch (err) {
      if (isAbortError(err)) {
        return undefined;
      }

      return 'fallback';
    }
  }

  private rememberProjectFileHandle(fileHandle: FileSystemFileHandle): string {
    const path = `${PROJECT_FILE_HANDLE_PATH_PREFIX}/${++this.#nextProjectFileHandleId}/${fileHandle.name}`;
    this.#projectFileHandles.set(path, fileHandle);
    return path;
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
