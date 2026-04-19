import { getError } from '@ironclad/rivet-core';
import { createJSONStorage } from 'jotai/utils';
import type { SyncStorage } from 'jotai/vanilla/utils/atomWithStorage';
import { debounce, type DebouncedFunc } from 'lodash-es';
import { createDefaultAsyncStorage, type AsyncStorageBackend } from './indexedDB';
import { handleError } from '../../utils/errorHandling.js';
import { initializeHybridStorage, memoryStorage } from './migrations';

export const allInitializeStoreFns = new Set<() => Promise<void>>();

type HybridStorageOptions = {
  debounceMs?: number;
};

type GroupedStorageController = {
  asyncStorage: AsyncStorageBackend;
  debounceMs: number;
  debouncedSave?: DebouncedFunc<(value: any) => Promise<void>>;
  pendingSave: Promise<void>;
  queueSave: (value: any) => Promise<void>;
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

function createDebouncedSave(
  controller: GroupedStorageController,
  debounceMs: number,
): DebouncedFunc<(value: any) => Promise<void>> | undefined {
  if (debounceMs <= 0) {
    return undefined;
  }

  return debounce(async (value: any) => {
    await controller.saveNow(value);
  }, debounceMs);
}

function persistGroupedSnapshot(controller: GroupedStorageController, value: any): void {
  if (controller.debouncedSave) {
    controller.debouncedSave(value);
  } else {
    void controller.saveNow(value);
  }
}

function getOrCreateGroupedStorageController(
  mainKey: string,
  asyncStorage: AsyncStorageBackend,
  debounceMs: number,
): GroupedStorageController {
  const existing = groupedStorageControllers.get(mainKey);
  if (existing) {
    existing.asyncStorage = asyncStorage;
    if (existing.debounceMs !== debounceMs) {
      existing.debouncedSave?.cancel();
      existing.debounceMs = debounceMs;
      existing.debouncedSave = createDebouncedSave(existing, debounceMs);
    }
    return existing;
  }

  const controller: GroupedStorageController = {
    asyncStorage,
    debounceMs,
    pendingSave: Promise.resolve(),
    queueSave: async (value: any) => {
      const serializedValue = JSON.stringify(value);
      const saveOperation = async () => {
        try {
          await controller.asyncStorage.setItem(mainKey, serializedValue);
        } catch (error) {
          handleError(error, 'Failed to save persistent storage item', {
            metadata: {
              key: mainKey,
            },
          });
        }
      };

      controller.pendingSave = controller.pendingSave.then(saveOperation, saveOperation);
      await controller.pendingSave;
    },
    saveNow: async (value: any) => {
      await controller.queueSave(value);
    },
    debouncedSave: undefined,
  };
  controller.debouncedSave = createDebouncedSave(controller, debounceMs);

  groupedStorageControllers.set(mainKey, controller);
  return controller;
}

export async function flushHybridStorageGroup(mainKey: string): Promise<void> {
  const controller = groupedStorageControllers.get(mainKey);
  if (!controller) {
    return;
  }

  controller.debouncedSave?.cancel();

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
  options: HybridStorageOptions = {},
): {
  storage: SyncStorage<any>;
} => {
  const jsonStorage = createJSONStorage<any>(() => localStorage);
  const groupedController = mainKey
    ? getOrCreateGroupedStorageController(mainKey, asyncStorage, options.debounceMs ?? 1000)
    : undefined;

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
        persistGroupedSnapshot(groupedController!, mainObject);
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
      persistGroupedSnapshot(groupedController!, mainObject);
    },
  };

  registerInitializeStoreFn(mainKey, asyncStorage);
  void jsonStorage;

  return { storage };
};
