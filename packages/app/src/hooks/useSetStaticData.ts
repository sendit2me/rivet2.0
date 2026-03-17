import { useSetAtom } from 'jotai';
import { useStaticDataDatabase } from './useStaticDataDatabase';
import { projectDataState } from '../state/savedGraphs';
import { type DataId } from '@ironclad/rivet-core';
import { entries } from '../../../core/src/utils/typeSafety';
import { handleError } from '../utils/errorHandling.js';

export function useSetStaticData() {
  const setProjectData = useSetAtom(projectDataState);
  const database = useStaticDataDatabase();

  return async (data: Record<DataId, string>) => {
    setProjectData((prev) => {
      return {
        ...prev,
        ...data,
      };
    });

    for (const [id, dataValue] of entries(data)) {
      try {
        await database.insert(id, dataValue);
      } catch (err) {
        handleError(err, 'Failed to persist static data entry', {
          metadata: {
            dataId: id,
          },
          toastError: false,
        });
      }
    }
  };
}
