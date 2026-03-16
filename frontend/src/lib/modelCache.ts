/**
 * Model Cache using IndexedDB
 * Caches ONNX model files locally to avoid re-downloading on page refresh
 */

const DB_NAME = 'wakeword-models';
const DB_VERSION = 1;
const STORE_NAME = 'models';

interface CachedModel {
  url: string;
  data: ArrayBuffer;
  timestamp: number;
  version: string;
}

// Model version - change this to force re-download of models
const MODEL_VERSION = '2.0.0';

class ModelCache {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;

  constructor() {
    this.dbReady = this.initDB();
  }

  private initDB(): Promise<void> {
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn('IndexedDB not available, models will be fetched from network');
        resolve(); // Don't reject, just continue without cache
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        }
      };
    });
  }

  async get(url: string): Promise<ArrayBuffer | null> {
    await this.dbReady;
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result as CachedModel | undefined;
        if (result && result.version === MODEL_VERSION) {
          console.log(`Cache hit for ${url}`);
          resolve(result.data);
        } else {
          console.log(`Cache miss for ${url}`);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.warn(`Cache read error for ${url}`);
        resolve(null);
      };
    });
  }

  async set(url: string, data: ArrayBuffer): Promise<void> {
    await this.dbReady;
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const cachedModel: CachedModel = {
        url,
        data,
        timestamp: Date.now(),
        version: MODEL_VERSION,
      };

      const request = store.put(cachedModel);

      request.onsuccess = () => {
        console.log(`Cached ${url}`);
        resolve();
      };

      request.onerror = () => {
        console.warn(`Cache write error for ${url}`);
        resolve();
      };
    });
  }

  async clear(): Promise<void> {
    await this.dbReady;
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('Cache cleared');
        resolve();
      };

      request.onerror = () => {
        console.warn('Cache clear error');
        resolve();
      };
    });
  }
}

// Singleton instance
export const modelCache = new ModelCache();

/**
 * Fetch model with IndexedDB caching
 */
export async function fetchModelWithCache(url: string): Promise<ArrayBuffer> {
  // Try to get from cache first
  const cached = await modelCache.get(url);
  if (cached) {
    return cached;
  }

  // Fetch from network
  console.log(`Fetching ${url} from network...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }

  const data = await response.arrayBuffer();
  
  // Cache for next time (don't await, do it in background)
  modelCache.set(url, data.slice(0)).catch(console.warn);

  return data;
}
