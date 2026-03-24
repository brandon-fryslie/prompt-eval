import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShareableColumn {
  model: string;
  provider: string;
  prompt: string;
  preprocessEnabled: boolean;
  preprocessPrompt: string;
}

export interface ShareableConfig {
  v: number;
  mode: 'models' | 'prompts';
  columns: ShareableColumn[];
  sharedPrompt: string;
  sharedModel: string;
  sharedProvider: string;
  evalEnabled: boolean;
  rubricEnabled?: boolean;
  rubricDimensions?: Array<{ name: string; description: string }>;
}

// ── Encode / Decode ───────────────────────────────────────────────────────────

const CURRENT_VERSION = 1;
const SHARE_PREFIX = '#share=';

export function encodeShareLink(config: ShareableConfig): string {
  const payload: ShareableConfig = { ...config, v: CURRENT_VERSION };
  const json = JSON.stringify(payload);
  const compressed = compressToEncodedURIComponent(json);
  return window.location.origin + window.location.pathname + SHARE_PREFIX + compressed;
}

export function decodeShareLink(hash: string): ShareableConfig | null {
  const idx = hash.indexOf(SHARE_PREFIX);
  if (idx === -1) return null;

  const compressed = hash.slice(idx + SHARE_PREFIX.length);
  if (!compressed) return null;

  const json = decompressFromEncodedURIComponent(compressed);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  // Validate required fields
  if (
    typeof parsed !== 'object' || parsed === null ||
    !('v' in parsed) ||
    !('mode' in parsed) ||
    !('columns' in parsed) ||
    !Array.isArray((parsed as ShareableConfig).columns)
  ) {
    return null;
  }

  return parsed as ShareableConfig;
}
