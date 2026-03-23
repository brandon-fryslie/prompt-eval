// [LAW:one-source-of-truth] Single IndexedDB wrapper for test suite persistence

import type { RubricScores } from './openai';

// ── Data Model ────────────────────────────────────────────────────────────────

export interface TestSuite {
  id: string;
  name: string;
  prompts: string[];
  createdAt: number;
}

export interface TestSuiteRunColumnResult {
  columnIndex: number;
  response: string;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  latencyMs: number | null;
}

export interface TestSuiteRunPromptResult {
  promptIndex: number;
  promptText: string;
  columns: TestSuiteRunColumnResult[];
  rubricScores?: RubricScores;
}

export interface TestSuiteRunAggregatedColumn {
  columnIndex: number;
  totalCost: number | null;
  avgLatencyMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgRubricScores?: Record<string, number>; // dimension -> average
}

export interface TestSuiteRunAggregated {
  perColumn: TestSuiteRunAggregatedColumn[];
  overallRubricAvg?: Record<string, Record<string, number>>; // columnLabel -> dimension -> avg
}

export interface TestSuiteRunResult {
  id: string;
  suiteId: string;
  suiteName: string;
  timestamp: number;
  mode: 'models' | 'prompts';
  columnConfigs: Array<{ model: string; provider: string; label: string }>;
  results: TestSuiteRunPromptResult[];
  aggregated: TestSuiteRunAggregated;
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────

const DB_NAME = 'prompt-eval-test-suites';
const SUITES_STORE = 'suites';
const RUNS_STORE = 'runs';
const DB_VERSION = 1;

// [LAW:single-enforcer] One place to open/upgrade the database
export function openTestSuiteDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SUITES_STORE)) {
        db.createObjectStore(SUITES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RUNS_STORE)) {
        const store = db.createObjectStore(RUNS_STORE, { keyPath: 'id' });
        store.createIndex('suiteId', 'suiteId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Suite CRUD ────────────────────────────────────────────────────────────────

export async function saveSuite(suite: TestSuite): Promise<void> {
  const db = await openTestSuiteDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUITES_STORE, 'readwrite');
    tx.objectStore(SUITES_STORE).put(suite);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listSuites(): Promise<TestSuite[]> {
  const db = await openTestSuiteDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUITES_STORE, 'readonly');
    const req = tx.objectStore(SUITES_STORE).getAll();
    req.onsuccess = () => {
      const results = req.result as TestSuite[];
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSuite(id: string): Promise<void> {
  const db = await openTestSuiteDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUITES_STORE, 'readwrite');
    tx.objectStore(SUITES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Run Result CRUD ───────────────────────────────────────────────────────────

export async function saveRunResult(result: TestSuiteRunResult): Promise<void> {
  const db = await openTestSuiteDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RUNS_STORE, 'readwrite');
    tx.objectStore(RUNS_STORE).put(result);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listRunResults(suiteId?: string): Promise<TestSuiteRunResult[]> {
  const db = await openTestSuiteDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RUNS_STORE, 'readonly');
    const store = tx.objectStore(RUNS_STORE);
    const req = suiteId
      ? store.index('suiteId').getAll(suiteId)
      : store.getAll();
    req.onsuccess = () => {
      const results = req.result as TestSuiteRunResult[];
      results.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRunResult(id: string): Promise<void> {
  const db = await openTestSuiteDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RUNS_STORE, 'readwrite');
    tx.objectStore(RUNS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Aggregation ───────────────────────────────────────────────────────────────

// [LAW:single-enforcer] One place to compute aggregated metrics from raw results
export function aggregateResults(
  results: TestSuiteRunPromptResult[],
  columnCount: number,
  columnLabels: string[],
): TestSuiteRunAggregated {
  const perColumn: TestSuiteRunAggregatedColumn[] = Array.from({ length: columnCount }, (_, colIdx) => {
    const colResults = results.map((r) => r.columns.find((c) => c.columnIndex === colIdx)).filter(Boolean) as TestSuiteRunColumnResult[];

    const totalCost = colResults.reduce<number | null>((acc, c) => c.cost != null ? (acc ?? 0) + c.cost : acc, null);
    const latencies = colResults.map((c) => c.latencyMs).filter((v): v is number => v != null);
    const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
    const totalInputTokens = colResults.reduce((a, c) => a + c.inputTokens, 0);
    const totalOutputTokens = colResults.reduce((a, c) => a + c.outputTokens, 0);

    // Average rubric scores across prompts for this column
    const rubricResults = results.filter((r) => r.rubricScores?.columns);
    let avgRubricScores: Record<string, number> | undefined;
    if (rubricResults.length > 0) {
      const label = columnLabels[colIdx] ?? `Column ${colIdx + 1}`;
      const allDimScores: Record<string, number[]> = {};
      for (const r of rubricResults) {
        const colScores = r.rubricScores?.columns[label];
        if (!colScores) continue;
        for (const [dim, score] of Object.entries(colScores)) {
          (allDimScores[dim] ??= []).push(score);
        }
      }
      const entries = Object.entries(allDimScores);
      if (entries.length > 0) {
        avgRubricScores = {};
        for (const [dim, scores] of entries) {
          avgRubricScores[dim] = scores.reduce((a, b) => a + b, 0) / scores.length;
        }
      }
    }

    return { columnIndex: colIdx, totalCost, avgLatencyMs, totalInputTokens, totalOutputTokens, avgRubricScores };
  });

  // Overall rubric avg: columnLabel -> dimension -> avg
  let overallRubricAvg: Record<string, Record<string, number>> | undefined;
  const hasRubric = perColumn.some((c) => c.avgRubricScores);
  if (hasRubric) {
    overallRubricAvg = {};
    for (let i = 0; i < columnCount; i++) {
      const label = columnLabels[i] ?? `Column ${i + 1}`;
      const scores = perColumn[i].avgRubricScores;
      if (scores) overallRubricAvg[label] = scores;
    }
  }

  return { perColumn, overallRubricAvg };
}
