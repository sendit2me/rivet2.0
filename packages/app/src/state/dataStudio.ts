import { Dataset, type DatasetId, type DatasetMetadata } from '@valerypopoff/rivet2-core';
import { atom } from 'jotai';

export const datasetsState = atom<DatasetMetadata[]>([]);

export const selectedDatasetState = atom<DatasetId | undefined>(undefined);
