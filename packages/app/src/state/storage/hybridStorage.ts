import { getError } from '@ironclad/rivet-core';
import { createJSONStorage } from 'jotai/utils';
import type { SyncStorage } from 'jotai/vanilla/utils/atomWithStorage';
import { debounce } from 'lodash-es';
import { createDefaultAsyncStorage, type AsyncStorageBackend } from './indexedDB';
import { handleError } from '../../utils/errorHandling.js';
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
      handleError(error, 'Failed to save persistent storage item', {
        metadata: {
          key,
        },
      });
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
        handleError(error, 'Failed to update in-memory storage item', {
          metadata: {
            key,
            mainKey,
            normalizedError: getError(error).message,
          },
        });
      }
    },
    removeItem: (key): void => {
      if (!mainKey) {
        memoryStorage.delete(key);
        asyncStorage.removeItem(key).catch((error) => {
          handleError(error, 'Failed to remove persistent storage item', {
            metadata: {
              key,
            },
            toastError: false,
          });
        });
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
