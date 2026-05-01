import {
  type ProjectReference,
  type Project,
  type ProjectReferenceLoader,
  deserializeProject,
} from '@ironclad/rivet-core';
import { handleError } from '../utils/errorHandling.js';
import type { PathPolicyProvider } from '../providers/ProvidersContext.js';
import { getDefaultPathPolicyProvider } from '../utils/tauri.js';

export class TauriProjectReferenceLoader implements ProjectReferenceLoader {
  readonly #pathPolicy: PathPolicyProvider;

  constructor(pathPolicy: PathPolicyProvider = getDefaultPathPolicyProvider()) {
    this.#pathPolicy = pathPolicy;
  }

  async loadProject(currentProjectPath: string | undefined, reference: ProjectReference): Promise<Project> {
    if (currentProjectPath === undefined) {
      throw new Error(
        `Could not load project "${reference.title} (${reference.id})": current project path is undefined.`,
      );
    }

    for (const path of reference.hintPaths ?? []) {
      try {
        if (!this.#pathPolicy.readRelativeProjectFile) {
          throw new Error('The active path policy does not support relative project references.');
        }

        const projectData = await this.#pathPolicy.readRelativeProjectFile(currentProjectPath, path);

        const [project] = deserializeProject(projectData);
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
