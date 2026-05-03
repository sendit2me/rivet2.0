import { type DatasetId, type DatasetMetadata, type ProjectId } from '@rivet2/rivet-core';
import { useEffect } from 'react';
import { datasetsState } from '../state/dataStudio';
import { useAtom } from 'jotai';
import { useStableCallback } from './useStableCallback';
import { useDatasetProvider } from '../providers/ProvidersContext';
import { handleError } from '../utils/errorHandling.js';

export function useDatasets(projectId: ProjectId) {
  const datasetProvider = useDatasetProvider();
  const [datasets, setDatasets] = useAtom(datasetsState);

  const initDatasets = useStableCallback(async () => {
    try {
      await datasetProvider.loadDatasets?.(projectId);
      await reloadDatasets();
    } catch (err) {
      handleError(err, 'Failed to initialize datasets', {
        metadata: {
          projectId,
        },
      });
    }
  });

  const reloadDatasets = async () => {
    try {
      const datasets = await datasetProvider.getDatasetsForProject(projectId);
      setDatasets(datasets);
    } catch (err) {
      handleError(err, 'Failed to reload datasets', {
        metadata: {
          projectId,
        },
      });
    }
  };

  const updateDatasets = async (operation: () => Promise<void>) => {
    await operation();
    await reloadDatasets();
  };

  useEffect(() => {
    initDatasets();
  }, [projectId, initDatasets]);

  const putDataset = async (dataset: DatasetMetadata) => {
    await updateDatasets(async () => {
      await datasetProvider.putDatasetMetadata(dataset);
    });
  };

  const deleteDataset = async (datasetId: DatasetId) => {
    await updateDatasets(async () => {
      await datasetProvider.deleteDataset(datasetId);
    });
  };

  return {
    datasets,
    putDataset,
    deleteDataset,
  };
}
