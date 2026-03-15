import { createJSONStorage } from 'jotai/utils';
import type { AsyncStorageBackend } from './indexedDB';

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
      console.error('Error reading from localStorage:', error);
    }
  } catch (error) {
    console.error('Error initializing store:', error);

    if (mainKey) {
      try {
        const localData = jsonStorage.getItem(mainKey, null);
        if (localData) {
          memoryStorage.set(mainKey, localData);
        }
      } catch (localError) {
        console.error('Error reading from localStorage:', localError);
      }
    }
  }
}
