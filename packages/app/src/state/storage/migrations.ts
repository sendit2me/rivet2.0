import { createJSONStorage } from 'jotai/utils';
import type { AsyncStorageBackend } from './indexedDB';
import { handleError } from '../../utils/errorHandling.js';

export const memoryStorage = new Map<string, any>();

export async function initializeHybridStorage(mainKey: string | undefined, asyncStorage: AsyncStorageBackend): Promise<void> {
  const jsonStorage = createJSONStorage<any>(() => localStorage);

  try {
    if (!mainKey) {
      return;
    }

    const storedData = await asyncStorage.getItem(mainKey);
    if (storedData) {
      memoryStorage.set(mainKey, JSON.parse(storedData));
      return;
    }

    try {
      const localData = jsonStorage.getItem(mainKey, null);
      if (localData) {
        memoryStorage.set(mainKey, localData);
        await asyncStorage.setItem(mainKey, JSON.stringify(localData));
      }
    } catch (error) {
      handleError(error, 'Failed to migrate storage from localStorage', {
        metadata: {
          mainKey,
        },
        toastError: false,
      });
    }
  } catch (error) {
    handleError(error, 'Failed to initialize hybrid storage', {
      metadata: {
        mainKey,
      },
      toastError: false,
    });

    if (mainKey) {
      try {
        const localData = jsonStorage.getItem(mainKey, null);
        if (localData) {
          memoryStorage.set(mainKey, localData);
        }
      } catch (localError) {
        handleError(localError, 'Failed to recover hybrid storage from localStorage fallback', {
          metadata: {
            mainKey,
          },
          toastError: false,
        });
      }
    }
  }
}
