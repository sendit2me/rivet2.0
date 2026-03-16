import { useWorkspaceTransitions } from './useWorkspaceTransitions.js';

export function useSaveProject() {
  const workspaceTransitions = useWorkspaceTransitions();

  async function saveProject() {
    await workspaceTransitions.saveProject();
  }

  async function saveProjectAs() {
    await workspaceTransitions.saveProject({ forceSaveAs: true });
  }

  return {
    saveProject,
    saveProjectAs,
  };
}
