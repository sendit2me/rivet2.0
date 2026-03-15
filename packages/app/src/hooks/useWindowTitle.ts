import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { projectState, loadedProjectState } from '../state/savedGraphs';
import { getAppVersion, getAppWindowHandle } from '../utils/nativeApp';

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
