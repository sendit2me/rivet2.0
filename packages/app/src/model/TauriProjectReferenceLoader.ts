import { type ProjectReference, type Project, type ProjectReferenceLoader, deserializeProject } from '@ironclad/rivet-core';
import { invokeNative } from '../utils/platform/core.js';
import { handleError } from '../utils/errorHandling.js';

export class TauriProjectReferenceLoader implements ProjectReferenceLoader {
  async loadProject(currentProjectPath: string | undefined, reference: ProjectReference): Promise<Project> {

    if (currentProjectPath === undefined) {
      throw new Error(
        `Could not load project "${reference.title} (${reference.id})": current project path is undefined.`,
      );
    }

    for (const path of reference.hintPaths ?? []) {
      try {
        const projectData = await invokeNative<string>('read_relative_project_file', {
          relativeFrom: currentProjectPath,
          projectFilePath: path,
        });

        const [project, attachedData] = deserializeProject(projectData);
        return project;
      } catch (err) {
        handleError(err, 'Failed to load referenced project from hint path', {
          metadata: {
            currentProjectPath,
            hintPath: path,
            referenceId: reference.id,
            referenceTitle: reference.title,
          },
          toastError: false,
        });
      }
    }

    throw new Error(
      `Could not load project "${reference.title} (${reference.id})": all hint paths failed. Tried: ${reference.hintPaths}`,
    );
  }
}
