import { createContext, useContext, useMemo, type FC, type ReactNode } from 'react';
import { type IOProvider } from '../io/IOProvider.js';
import { type DatasetProvider, type AudioProvider, type ProjectId, type CombinedDataset } from '@ironclad/rivet-core';
import { BrowserIOProvider } from '../io/BrowserIOProvider.js';
import { LegacyBrowserIOProvider } from '../io/LegacyBrowserIOProvider.js';
import { TauriIOProvider } from '../io/TauriIOProvider.js';
import { BrowserDatasetProvider } from '../io/BrowserDatasetProvider.js';
import { TauriBrowserAudioProvider } from '../io/TauriBrowserAudioProvider.js';
import { getGlobalDataRef, setGlobalDataRef } from '../utils/globals/globalDataRefs.js';

export type DataRefStore = {
  get(key: string): ReturnType<typeof getGlobalDataRef>;
  set(key: string, value: Parameters<typeof setGlobalDataRef>[1]): void;
};

export type AppDatasetProvider = DatasetProvider & {
  loadDatasets?(projectId: ProjectId): Promise<void>;
  importDatasetsForProject?(projectId: ProjectId, datasets: CombinedDataset[]): Promise<void>;
};

export type Providers = {
  io: IOProvider;
  datasets: AppDatasetProvider;
  audio: AudioProvider;
  dataRefs: DataRefStore;
};

const ProvidersContext = createContext<Providers | null>(null);

export function useProviders(): Providers {
  const ctx = useContext(ProvidersContext);
  if (!ctx) {
    throw new Error('useProviders must be used within a ProvidersProvider');
  }
  return ctx;
}

export function useIOProvider(): IOProvider {
  return useProviders().io;
}

export function useDatasetProvider(): AppDatasetProvider {
  return useProviders().datasets;
}

export function useAudioProvider(): AudioProvider {
  return useProviders().audio;
}

export function useDataRefs(): DataRefStore {
  return useProviders().dataRefs;
}

function createDefaultProviders(): Providers {
  const datasets = new BrowserDatasetProvider();

  let io: IOProvider;
  if (TauriIOProvider.isSupported()) {
    io = new TauriIOProvider(datasets);
  } else if (BrowserIOProvider.isSupported()) {
    io = new BrowserIOProvider();
  } else {
    io = new LegacyBrowserIOProvider();
  }

  return {
    io,
    datasets,
    audio: new TauriBrowserAudioProvider(),
    dataRefs: {
      get: getGlobalDataRef,
      set: setGlobalDataRef,
    },
  };
}

// Default providers singleton (for non-React code that can't use context)
let defaultProviders: Providers | undefined;

export function getDefaultProviders(): Providers {
  if (!defaultProviders) {
    defaultProviders = createDefaultProviders();
  }
  return defaultProviders;
}

export const ProvidersProvider: FC<{ providers?: Providers; children: ReactNode }> = ({ providers, children }) => {
  const value = useMemo(() => providers ?? getDefaultProviders(), [providers]);

  return <ProvidersContext.Provider value={value}>{children}</ProvidersContext.Provider>;
};
