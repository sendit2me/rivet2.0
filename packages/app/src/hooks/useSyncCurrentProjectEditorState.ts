import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { projectEditorHydratedState } from '../state/projectEditor.js';
import { useCurrentProjectEditorSnapshot } from './useCurrentProjectEditorSnapshot.js';

export function useSyncCurrentProjectEditorState() {
  const hydrated = useAtomValue(projectEditorHydratedState);
  const { currentProject, persistCurrentProjectEditorSnapshot } = useCurrentProjectEditorSnapshot();

  useEffect(() => {
    if (!hydrated || !currentProject.metadata.id) {
      return;
    }

    persistCurrentProjectEditorSnapshot();
  }, [currentProject.metadata.id, hydrated, persistCurrentProjectEditorSnapshot]);
}
