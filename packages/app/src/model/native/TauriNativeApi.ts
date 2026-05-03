import { type BaseDir, type NativeApi, type ReadDirOptions } from '@valerypopoff/rivet2-core';

import { minimatch } from 'minimatch';
import { nativeReadBinaryFile, nativeReadDir, nativeReadTextFile, nativeWriteFile } from '../../utils/platform/fs.js';

const baseDirToBaseDirectoryMap: Record<BaseDir, string> = {
  app: 'App',
  appCache: 'AppCache',
  appConfig: 'AppConfig',
  appData: 'AppData',
  appLocalData: 'AppLocalData',
  appLog: 'AppLog',
  audio: 'Audio',
  cache: 'Cache',
  config: 'Config',
  data: 'Data',
  desktop: 'Desktop',
  document: 'Document',
  download: 'Download',
  executable: 'Executable',
  font: 'Font',
  home: 'Home',
  localData: 'LocalData',
  log: 'Log',
  picture: 'Picture',
  public: 'Public',
  resource: 'Resource',
  runtime: 'Runtime',
  temp: 'Temp',
  template: 'Template',
  video: 'Video',
};
const baseDirToBaseDirectory = (baseDir?: string): string | undefined =>
  baseDir ? baseDirToBaseDirectoryMap[baseDir as BaseDir] : undefined;

export class TauriNativeApi implements NativeApi {
  async readdir(path: string, baseDir?: BaseDir, options: ReadDirOptions = {}): Promise<string[]> {
    const { recursive = false, includeDirectories = false, filterGlobs = [], relative = false, ignores = [] } = options;

    const baseDirectory = baseDirToBaseDirectory(baseDir);
    const results = await nativeReadDir(path, { dir: baseDirectory, recursive });
    type FileTreeEntry = { children?: FileTreeEntry[]; path: string };
    const entries = results as FileTreeEntry[];

    const flattenResults = (tree: FileTreeEntry[]): FileTreeEntry[] =>
      tree.flatMap((result) => (result.children ? [result, ...flattenResults(result.children)] : [result]));

    let filteredResults = flattenResults(entries)
      .filter((result) => (includeDirectories ? true : result.children == null))
      .map((result) => result.path);

    if (filterGlobs.length > 0) {
      for (const glob of filterGlobs) {
        filteredResults = filteredResults.filter((result) => minimatch(result, glob, { dot: true }));
      }
    }

    if (ignores.length > 0) {
      for (const ignore of ignores) {
        filteredResults = filteredResults.filter((result) => !minimatch(result, ignore, { dot: true }));
      }
    }

    // TODO approximate, will fail when the parent directory name repeats.
    filteredResults = filteredResults.map((result) =>
      relative ? result.slice(result.indexOf(path) + path.length + 1) : result,
    );

    return filteredResults;
  }

  async readTextFile(path: string, baseDir?: BaseDir): Promise<string> {
    const baseDirectory = baseDirToBaseDirectory(baseDir);
    const result = await nativeReadTextFile(path, { dir: baseDirectory });
    return result;
  }

  async readBinaryFile(path: string, baseDir?: BaseDir): Promise<Blob> {
    const baseDirectory = baseDirToBaseDirectory(baseDir);
    const result = await nativeReadBinaryFile(path, { dir: baseDirectory });
    return new Blob([result]);
  }

  async writeTextFile(path: string, data: string, baseDir?: BaseDir): Promise<void> {
    const baseDirectory = baseDirToBaseDirectory(baseDir);
    await nativeWriteFile(path, data, { dir: baseDirectory });
  }

  async exec(command: string, args: string[], options?: { cwd?: string | undefined } | undefined): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
