import { type Project, deserializeDatasets, serializeDatasets } from '@ironclad/rivet-core';
import { allowDataFileNeighbor } from '../utils/tauri.js';
import { type AppDatasetProvider } from '../providers/ProvidersContext.js';
import { nativeExists, nativeReadTextFile, nativeWriteFile } from '../utils/platform/fs.js';

export async function saveDatasetsFile(projectFilePath: string, project: Project, datasetProvider: AppDatasetProvider) {
  await allowDataFileNeighbor(projectFilePath);

  const dataPath = projectFilePath.replace('.rivet-project', '.rivet-data');
  const datasets = await datasetProvider.exportDatasetsForProject(project.metadata.id);

  if (datasets.length > 0 || (await nativeExists(dataPath))) {
    const serializedDatasets = serializeDatasets(datasets);

    await nativeWriteFile({
      contents: serializedDatasets,
      path: dataPath,
    });
  }
}

export async function loadDatasetsFile(projectFilePath: string, project: Project, datasetProvider: AppDatasetProvider) {
  await allowDataFileNeighbor(projectFilePath);

  const datasetsFilePath = projectFilePath.replace('.rivet-project', '.rivet-data');

  const datasetsFileExists = await nativeExists(datasetsFilePath);

  // No data file, so just no datasets
  if (!datasetsFileExists) {
    await datasetProvider.importDatasetsForProject?.(project.metadata.id, []);
    return;
  }

  const fileContents = await nativeReadTextFile(datasetsFilePath);

  const datasets = deserializeDatasets(fileContents);

  await datasetProvider.importDatasetsForProject?.(project.metadata.id, datasets);
}
