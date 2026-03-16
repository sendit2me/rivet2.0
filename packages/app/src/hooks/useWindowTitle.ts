import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { projectState, loadedProjectState } from '../state/savedGraphs';
import { getAppVersion } from '../utils/platform/app.js';
import { getAppWindowHandle } from '../utils/platform/window.js';

export function useWindowTitle() {
  const project = useAtomValue(projectState);
  const loadedProject = useAtomValue(loadedProjectState);

  useEffect(() => {
    (async () => {
      try {
        const currentVersion = await getAppVersion();
        const appWindow = await getAppWindowHandle();
        await appWindow?.setTitle?.(
          `Rivet ${currentVersion} - ${project.metadata.title} (${
            loadedProject?.path?.trim() ? loadedProject.path : 'Unsaved'
          })`,
        );
      } catch (err) {
        console.warn(`Failed to set window title, likely not running in Tauri: ${err}`);
      }
    })();
  }, [loadedProject, project.metadata.title]);
}
