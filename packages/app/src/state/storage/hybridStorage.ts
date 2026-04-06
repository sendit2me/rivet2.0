import { getError } from '@ironclad/rivet-core';
import { createJSONStorage } from 'jotai/utils';
import type { SyncStorage } from 'jotai/vanilla/utils/atomWithStorage';
import { debounce, type DebouncedFunc } from 'lodash-es';
import { createDefaultAsyncStorage, type AsyncStorageBackend } from './indexedDB';
import { handleError } from '../../utils/errorHandling.js';
import { initializeHybridStorage, memoryStorage } from './migrations';

export const allInitializeStoreFns = new Set<() => Promise<void>>();

type GroupedStorageController = {
  asyncStorage: AsyncStorageBackend;
  debouncedSave: DebouncedFunc<(value: any) => Promise<void>>;
  saveNow: (value: any) => Promise<void>;
};

const groupedStorageControllers = new Map<string, GroupedStorageController>();
const groupedInitializeControllers = new Map<
  string,
  {
    asyncStorage: AsyncStorageBackend;
    initialize: () => Promise<void>;
  }
>();

function getOrCreateGroupedStorageController(mainKey: string, asyncStorage: AsyncStorageBackend): GroupedStorageController {
  const existing = groupedStorageControllers.get(mainKey);
  if (existing) {
    existing.asyncStorage = asyncStorage;
    return existing;
  }

  const controller: GroupedStorageController = {
    asyncStorage,
    saveNow: async (value: any) => {
      try {
        await controller.asyncStorage.setItem(mainKey, JSON.stringify(value));
      } catch (error) {
        handleError(error, 'Failed to save persistent storage item', {
          metadata: {
            key: mainKey,
          },
        });
      }
    },
    debouncedSave: debounce(async (value: any) => {
      await controller.saveNow(value);
    }, 1000),
  };

  groupedStorageControllers.set(mainKey, controller);
  return controller;
}

export async function flushHybridStorageGroup(mainKey: string): Promise<void> {
  const controller = groupedStorageControllers.get(mainKey);
  if (!controller) {
    return;
  }

  controller.debouncedSave.cancel();

  const value = memoryStorage.get(mainKey);
  if (value === undefined) {
    return;
  }

  await controller.saveNow(value);
}

function registerInitializeStoreFn(mainKey: string | undefined, asyncStorage: AsyncStorageBackend): void {
  if (!mainKey) {
    allInitializeStoreFns.add(async () => initializeHybridStorage(mainKey, asyncStorage));
    return;
  }

  const existing = groupedInitializeControllers.get(mainKey);
  if (existing) {
    existing.asyncStorage = asyncStorage;
    return;
  }

  const controller = {
    asyncStorage,
    initialize: async () => initializeHybridStorage(mainKey, controller.asyncStorage),
  };

  groupedInitializeControllers.set(mainKey, controller);
  allInitializeStoreFns.add(controller.initialize);
}

export const createHybridStorage = (
  mainKey?: string,
  asyncStorage: AsyncStorageBackend = createDefaultAsyncStorage(),
): {
  storage: SyncStorage<any>;
} => {
  const jsonStorage = createJSONStorage<any>(() => localStorage);
  const groupedController = mainKey ? getOrCreateGroupedStorageController(mainKey, asyncStorage) : undefined;

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
          void asyncStorage.setItem(key, JSON.stringify(value)).catch((error) => {
            handleError(error, 'Failed to save persistent storage item', {
              metadata: {
                key,
              },
            });
          });
          return;
        }

        const mainObject = memoryStorage.get(mainKey) ?? {};
        mainObject[key] = value;
        memoryStorage.set(mainKey, mainObject);
        groupedController!.debouncedSave(mainObject);
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
      groupedController!.debouncedSave(mainObject);
    },
  };

  registerInitializeStoreFn(mainKey, asyncStorage);
  void jsonStorage;

  return { storage };
};
