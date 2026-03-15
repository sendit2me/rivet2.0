export interface AsyncStorageBackend {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export class MemoryAsyncStorage implements AsyncStorageBackend {
  #storage = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.#storage.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.#storage.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.#storage.delete(key);
  }
}

export class IndexedDBStorage implements AsyncStorageBackend {
  private dbName = 'jotai-store';
  private storeName = 'state';
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore(this.storeName);
      };
    });
  }

  async getItem(key: string): Promise<string | null> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName).put(value, key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName).delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export function createDefaultAsyncStorage(): AsyncStorageBackend {
  return typeof indexedDB === 'undefined' ? new MemoryAsyncStorage() : new IndexedDBStorage();
}
