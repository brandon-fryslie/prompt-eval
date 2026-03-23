// [LAW:one-source-of-truth] Single IndexedDB wrapper for experiment persistence

import type { RubricDimension, RubricScores } from './openai';

export interface ColumnSnapshot {
  id: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  startTime: number | null;
  firstTokenTime: number | null;
  endTime: number | null;
  preprocessResult: string;
}

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
  rubricEnabled?: boolean;
  rubricDimensions?: RubricDimension[];
  snapshot?: {
    columns: ColumnSnapshot[];
    evalResponse: string;
    totalCost: number | null;
    rubricScores?: RubricScores;
  };
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

// [LAW:single-enforcer] One place for file download mechanics
function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 100);
}

export function exportExperiment(exp: SavedExperiment): void {
  const filename = `experiment_${sanitizeFilename(exp.name)}.json`;
  downloadJson(exp, filename);
}

export async function exportAllExperiments(): Promise<void> {
  const experiments = await listExperiments();
  const filename = `all_experiments_${new Date().toISOString().slice(0, 10)}.json`;
  downloadJson(experiments, filename);
}

// [LAW:single-enforcer] One place for import validation
const REQUIRED_FIELDS: Array<keyof SavedExperiment> = ['id', 'name', 'timestamp', 'mode', 'columns'];

function isValidExperiment(obj: unknown): obj is SavedExperiment {
  if (typeof obj !== 'object' || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return REQUIRED_FIELDS.every((field) => field in record)
    && typeof record.name === 'string'
    && typeof record.timestamp === 'number'
    && (record.mode === 'models' || record.mode === 'prompts')
    && Array.isArray(record.columns);
}

export async function importExperiments(file: File): Promise<SavedExperiment[]> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);
  const items = Array.isArray(parsed) ? parsed : [parsed];

  const valid = items.filter(isValidExperiment);
  if (valid.length === 0) {
    throw new Error('No valid experiments found in file');
  }

  // [LAW:one-source-of-truth] Generate new IDs to avoid collisions with existing data
  const imported: SavedExperiment[] = valid.map((exp) => ({
    ...exp,
    id: crypto.randomUUID(),
  }));

  for (const exp of imported) {
    await saveExperiment(exp);
  }
  return imported;
}
