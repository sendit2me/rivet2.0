import { type Project } from '@rivet2/rivet-core';
import { type TrivetData } from '@rivet2/trivet';
import { type IOProvider, isPathBasedIOProvider } from '../io/IOProvider.js';

type ProjectSaveWithoutPromptProvider = IOProvider & {
  saveProjectDataNoPrompt(project: Project, testData: TrivetData, path: string): Promise<void>;
  canSaveProjectDataNoPrompt?(path: string): boolean;
};

export function canSaveProjectDataNoPrompt(
  ioProvider: IOProvider,
  path: string | null,
): ioProvider is ProjectSaveWithoutPromptProvider {
  if (!path || typeof (ioProvider as Partial<ProjectSaveWithoutPromptProvider>).saveProjectDataNoPrompt !== 'function') {
    return false;
  }

  const canSave = (ioProvider as Partial<ProjectSaveWithoutPromptProvider>).canSaveProjectDataNoPrompt;
  if (typeof canSave === 'function') {
    return canSave.call(ioProvider, path);
  }

  return isPathBasedIOProvider(ioProvider);
}
