import { useEffect, useState } from 'react';
import { type DatasetRow, type DatasetId, newId, type Dataset } from '@ironclad/rivet-core';
import { useStableCallback } from './useStableCallback';
import { useDatasetProvider } from '../providers/ProvidersContext';
import { handleError } from '../utils/errorHandling.js';

export function useDataset(datasetId: DatasetId) {
  const datasetProvider = useDatasetProvider();
  const [dataset, updateDataset] = useState<Dataset | null>(null);

  const reloadDatasetData = useStableCallback(async () => {
    try {
      const result = await datasetProvider.getDatasetData(datasetId);
      updateDataset(result);
    } catch (err) {
      handleError(err, 'Failed to reload dataset data', {
        metadata: {
          datasetId,
        },
      });
    }
  });

  useEffect(() => {
    reloadDatasetData();
  }, [datasetId, reloadDatasetData]);

  const persistDatasetRows = async (rows: DatasetRow[]) => {
    await datasetProvider.putDatasetData(datasetId, {
      ...dataset!,
      rows,
    });
    await reloadDatasetData();
  };

  const deleteRow = async (row: number) => {
    const newData = [...dataset!.rows];
    newData.splice(row, 1);
    await persistDatasetRows(newData);
  };

  const deleteColumn = async (column: number) => {
    const newData = dataset!.rows.map((row: DatasetRow) => ({
      ...row,
      data: row.data.filter((_: string, index: number) => index !== column),
    }));
    await persistDatasetRows(newData);
  };

  const insertRowAbove = async (row: number) => {
    const newData = [...dataset!.rows];
    newData.splice(row, 0, {
      id: newId(),
      data: Array(dataset!.rows[0]?.data.length ?? 1).fill(''),
    });
    await persistDatasetRows(newData);
  };

  const insertRowBelow = async (row: number) => {
    const newData = [...dataset!.rows];
    newData.splice(row + 1, 0, {
      id: newId(),
      data: Array(dataset!.rows[0]?.data.length ?? 1).fill(''),
    });
    await persistDatasetRows(newData);
  };

  const insertColumnLeft = async (column: number) => {
    const newData = dataset!.rows.map((row: DatasetRow) => ({
      ...row,
      data: [...row.data.slice(0, column), '', ...row.data.slice(column)],
    }));
    await persistDatasetRows(newData);
  };

  const insertColumnRight = async (column: number) => {
    const newData = dataset!.rows.map((row: DatasetRow) => ({
      ...row,
      data: [...row.data.slice(0, column + 1), '', ...row.data.slice(column + 1)],
    }));
    await persistDatasetRows(newData);
  };

  const putDatasetData = async (data: DatasetRow[]) => {
    await persistDatasetRows(data);
  };

  const clearData = async () => {
    await datasetProvider.clearDatasetData(datasetId);
    await reloadDatasetData();
  };

  return {
    dataset,
    deleteRow,
    deleteColumn,
    insertRowAbove,
    insertRowBelow,
    insertColumnLeft,
    insertColumnRight,
    putDatasetData,
    clearData,
  };
}
