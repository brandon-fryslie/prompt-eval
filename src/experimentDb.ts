// [LAW:one-source-of-truth] Single IndexedDB wrapper for experiment persistence

export interface SavedExperiment {
  id: string;
  name: string;
  timestamp: number;
  mode: 'models' | 'prompts';
  columns: Array<{
    id: string;
    model: string;
    provider: string;
    prompt: string;
    preprocessEnabled: boolean;
    preprocessPrompt: string;
  }>;
  sharedPrompt: string;
  sharedModel: string;
  sharedProvider: string;
  evalEnabled: boolean;
}

const DB_NAME = 'prompt-eval-experiments';
const STORE_NAME = 'experiments';
const DB_VERSION = 1;

// [LAW:single-enforcer] One place to open/upgrade the database
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveExperiment(exp: SavedExperiment): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(exp);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listExperiments(): Promise<SavedExperiment[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const results = req.result as SavedExperiment[];
      results.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteExperiment(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getExperiment(id: string): Promise<SavedExperiment | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result as SavedExperiment | undefined);
    req.onerror = () => reject(req.error);
  });
}
