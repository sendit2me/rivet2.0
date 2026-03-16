import { type ProjectReference, type Project, deserializeProject } from '@ironclad/rivet-core';
import { type ProjectReferenceLoader } from '../../../core/src/model/ProjectReferenceLoader';
import { invokeNative } from '../utils/platform/core.js';

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
        console.error(`Failed to load project "${reference.title} (${reference.id})" from path "${path}":`, err);
      }
    }

    throw new Error(
      `Could not load project "${reference.title} (${reference.id})": all hint paths failed. Tried: ${reference.hintPaths}`,
    );
  }
}
