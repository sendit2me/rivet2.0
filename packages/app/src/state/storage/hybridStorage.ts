import { getError } from '@ironclad/rivet-core';
import { createJSONStorage } from 'jotai/utils';
import type { SyncStorage } from 'jotai/vanilla/utils/atomWithStorage';
import { debounce } from 'lodash-es';
import { toast } from 'react-toastify';
import { createDefaultAsyncStorage, type AsyncStorageBackend } from './indexedDB';
import { initializeHybridStorage, memoryStorage } from './migrations';

export const allInitializeStoreFns = new Set<() => Promise<void>>();

export const createHybridStorage = (
  mainKey?: string,
  asyncStorage: AsyncStorageBackend = createDefaultAsyncStorage(),
): {
  storage: SyncStorage<any>;
} => {
  const jsonStorage = createJSONStorage<any>(() => localStorage);

  const debouncedSave = debounce(async (key: string, value: any) => {
    try {
      await asyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving to async storage:', error);
      toast.error(`Error saving to persistent storage: ${error}`);
    }
  }, 1000);

  const storage: SyncStorage<any> = {
    getItem: (key, initialValue) => {
      if (!mainKey) {
        return memoryStorage.get(key) ?? initialValue;
      }

      const mainObject = memoryStorage.get(mainKey) ?? {};
      return mainObject[key] ?? initialValue;
    },
    setItem: (key, value): void => {
      try {
        if (!mainKey) {
          memoryStorage.set(key, value);
          debouncedSave(key, value);
          return;
        }

        const mainObject = memoryStorage.get(mainKey) ?? {};
        mainObject[key] = value;
        memoryStorage.set(mainKey, mainObject);
        debouncedSave(mainKey, mainObject);
      } catch (error) {
        toast.error(`Error setting storage item: ${getError(error)}`);
      }
    },
    removeItem: (key): void => {
      if (!mainKey) {
        memoryStorage.delete(key);
        asyncStorage.removeItem(key).catch(console.error);
        return;
      }

      const mainObject = memoryStorage.get(mainKey) ?? {};
      delete mainObject[key];
      memoryStorage.set(mainKey, mainObject);
      debouncedSave(mainKey, mainObject);
    },
  };

  allInitializeStoreFns.add(async () => initializeHybridStorage(mainKey, asyncStorage));
  void jsonStorage;

  return { storage };
};
