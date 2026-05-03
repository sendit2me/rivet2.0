import { Dataset, type DatasetId, type DatasetMetadata } from '@rivet2/rivet-core';
import { atom } from 'jotai';

export const datasetsState = atom<DatasetMetadata[]>([]);

export const selectedDatasetState = atom<DatasetId | undefined>(undefined);
