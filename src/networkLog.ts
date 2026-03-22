// ── Network Log ──────────────────────────────────────────────────────────────
// Intercepts window.fetch to log all HTTP requests for transparency.
// [LAW:one-source-of-truth] The entries array is the single source of network log state.
// [LAW:single-enforcer] Interception happens at exactly one boundary: this module.

export interface NetworkLogEntry {
  id: number;
  url: string;
  displayUrl: string;
  method: string;
  timestamp: Date;
  status: number | null;
  duration: number | null;
  error: string | null;
}

type Listener = () => void;

let nextId = 1;
const entries: NetworkLogEntry[] = [];
const listeners: Set<Listener> = new Set();

function notify(): void {
  listeners.forEach((fn) => fn());
}

function extractDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname;
  } catch {
    return url;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getEntries(): readonly NetworkLogEntry[] {
  return entries;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function clearLog(): void {
  entries.length = 0;
  nextId = 1;
  notify();
}

// ── Fetch interceptor ────────────────────────────────────────────────────────

const originalFetch = window.fetch;

window.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

  const method = (init?.method ?? 'GET').toUpperCase();
  const start = performance.now();

  const entry: NetworkLogEntry = {
    id: nextId++,
    url,
    displayUrl: extractDisplayUrl(url),
    method,
    timestamp: new Date(),
    status: null,
    duration: null,
    error: null,
  };

  entries.push(entry);
  notify();

  try {
    const response = await originalFetch.call(window, input, init);
    entry.status = response.status;
    entry.duration = Math.round(performance.now() - start);
    notify();
    return response;
  } catch (err) {
    entry.duration = Math.round(performance.now() - start);
    entry.error = err instanceof Error ? err.message : String(err);
    notify();
    throw err;
  }
};
