// [LAW:one-source-of-truth] Variable interpolation UI — single component owns variable detection, data table, and run orchestration

import {
  Drawer, TextInput, Textarea, Text, Box, Badge, ActionIcon, Tooltip, Button, Table, Progress,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconTrash, IconPlus, IconPlayerPlay, IconPlayerStop, IconClipboard, IconClearAll, IconVariable,
} from '@tabler/icons-react';
import { useState, useCallback, useRef, useMemo } from 'react';
import {
  createClient, runPrompt, calcCost, formatCost,
  type PricingMap, type Provider, type ChatMessage,
} from '../openai';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColumnInfo {
  id: string;
  model: string;
  provider: string;
  prompt: string;
  preprocessEnabled: boolean;
  preprocessPrompt: string;
}

export interface VariableDrawerProps {
  opened: boolean;
  onClose: () => void;
  apiKeys: Record<string, string>;
  columns: ColumnInfo[];
  mode: 'models' | 'prompts';
  sharedPrompt: string;
  sharedModel: string;
  sharedProvider: string;
  providers: Record<string, Provider>;
  pricingMap: PricingMap;
}

interface RowResult {
  interpolatedPrompt: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  latencyMs: number;
  columnLabel: string;
}

// ── Pure functions ────────────────────────────────────────────────────────────

// [LAW:one-source-of-truth] Single variable detection function — all callers derive from this
export function detectVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g);
  const names = (matches ?? []).map((m) => m.slice(2, -2));
  return [...new Set(names)];
}

// [LAW:one-source-of-truth] Single interpolation function — pure, no side effects
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => vars[name] ?? match);
}

function parseCSV(text: string, expectedVars: string[]): Record<string, string>[] {
  const lines = text.trim().split('\n').filter((l) => l.trim());
  const rows: Record<string, string>[] = [];

  // Detect delimiter: tab or comma
  const delimiter = lines[0]?.includes('\t') ? '\t' : ',';

  // Check if first line is a header matching expected variables
  const firstLineParts = lines[0]?.split(delimiter).map((s) => s.trim()) ?? [];
  const hasHeader = expectedVars.length > 0 && firstLineParts.every((h) => expectedVars.includes(h));
  const headers = hasHeader ? firstLineParts : expectedVars;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  for (const line of dataLines) {
    const parts = line.split(delimiter).map((s) => s.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = parts[i] ?? ''; });
    rows.push(row);
  }
  return rows;
}

const COLUMN_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ── Component ─────────────────────────────────────────────────────────────────

export function VariableDrawer({
  opened, onClose, apiKeys, columns, mode, sharedPrompt, sharedModel, sharedProvider,
  providers, pricingMap,
}: VariableDrawerProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [csvText, setCsvText] = useState('');
  const [showCsvPaste, setShowCsvPaste] = useState(false);

  // Run state
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<RowResult[][]>([]); // results[rowIdx][colIdx]
  const abortRef = useRef(false);

  // ── Variable detection ────────────────────────────────────────────────────
  // [LAW:one-source-of-truth] Derive detected variables from the canonical prompt sources
  const prompts = useMemo(
    () => mode === 'models' ? [sharedPrompt] : columns.map((c) => c.prompt),
    [mode, sharedPrompt, columns],
  );

  const detectedVars = useMemo(
    () => detectVariables(prompts.join('\n')),
    [prompts],
  );

  // ── Row management ────────────────────────────────────────────────────────

  const addRow = useCallback(() => {
    const emptyRow: Record<string, string> = {};
    detectedVars.forEach((v) => { emptyRow[v] = ''; });
    setRows((prev) => [...prev, emptyRow]);
  }, [detectedVars]);

  const updateCell = useCallback((rowIdx: number, variable: string, value: string) => {
    setRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, [variable]: value } : r));
  }, []);

  const deleteRow = useCallback((rowIdx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== rowIdx));
    setResults((prev) => prev.filter((_, i) => i !== rowIdx));
  }, []);

  const clearAll = useCallback(() => {
    setRows([]);
    setResults([]);
    setCsvText('');
  }, []);

  const handlePasteCSV = useCallback(() => {
    const parsed = parseCSV(csvText, detectedVars);
    setRows(parsed);
    setResults([]);
    setCsvText('');
    setShowCsvPaste(false);
    notifications.show({ title: 'Imported', message: `${parsed.length} row(s) from pasted data`, color: 'teal' });
  }, [csvText, detectedVars]);

  // ── Run logic ─────────────────────────────────────────────────────────────

  const handleRunAll = useCallback(async () => {
    // Validate
    const activeColumns = mode === 'models'
      ? columns
      : columns.filter((c) => c.prompt.trim());

    const neededProviders = new Set(
      activeColumns.map((col) => mode === 'prompts' ? sharedProvider : col.provider),
    );
    const missingProviders = [...neededProviders].filter((p) => !apiKeys[p]?.trim());
    if (missingProviders.length > 0) {
      const names = missingProviders.map((p) => providers[p]?.name ?? p).join(', ');
      notifications.show({ title: 'API Key Required', message: `Missing API key for: ${names}`, color: 'red' });
      return;
    }
    if (rows.length === 0) {
      notifications.show({ title: 'No Data', message: 'Add at least one row to the data table', color: 'orange' });
      return;
    }
    if (detectedVars.length === 0) {
      notifications.show({ title: 'No Variables', message: 'No {{variable}} placeholders detected in prompts', color: 'orange' });
      return;
    }

    abortRef.current = false;
    setRunning(true);
    const totalSteps = rows.length * activeColumns.length;
    setRunProgress({ current: 0, total: totalSteps });
    const allResults: RowResult[][] = rows.map(() => []);

    let stepCount = 0;

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const rowVars = rows[rowIdx];

      for (let colIdx = 0; colIdx < activeColumns.length; colIdx++) {
        if (abortRef.current) break;

        const col = activeColumns[colIdx];
        const effectiveProvider = mode === 'prompts' ? sharedProvider : col.provider;
        const effectiveModel = mode === 'prompts' ? sharedModel : col.model;
        const templateText = mode === 'models' ? sharedPrompt : col.prompt;
        const interpolatedPrompt = interpolate(templateText, rowVars);

        const client = createClient({
          apiKey: apiKeys[effectiveProvider]!.trim(),
          baseUrl: providers[effectiveProvider]?.baseUrl,
        });

        // Handle preprocessing
        let promptToRun = interpolatedPrompt;
        if (col.preprocessEnabled && col.preprocessPrompt.trim()) {
          const combined = `${col.preprocessPrompt.trim()}\n\n${interpolatedPrompt}`;
          const preprocessResult = await runPrompt(client, effectiveModel, [{ role: 'user', content: combined }], () => {});
          promptToRun = preprocessResult.text;
        }

        const messages: ChatMessage[] = [{ role: 'user', content: promptToRun }];
        const startTime = Date.now();

        try {
          let responseText = '';
          const result = await runPrompt(client, effectiveModel, messages, (delta) => { responseText += delta; });
          const latencyMs = Date.now() - startTime;
          const cost = calcCost(effectiveModel, result.inputTokens, result.outputTokens, pricingMap);

          const colGlobalIdx = columns.indexOf(col);
          const label = `${COLUMN_LABELS[colGlobalIdx] ?? colIdx + 1}`;

          allResults[rowIdx].push({
            interpolatedPrompt,
            response: result.text,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cost,
            latencyMs,
            columnLabel: label,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          const colGlobalIdx = columns.indexOf(col);
          allResults[rowIdx].push({
            interpolatedPrompt,
            response: `Error: ${msg}`,
            inputTokens: 0,
            outputTokens: 0,
            cost: null,
            latencyMs: Date.now() - startTime,
            columnLabel: `${COLUMN_LABELS[colGlobalIdx] ?? colIdx + 1}`,
          });
        }

        stepCount++;
        setRunProgress({ current: stepCount, total: totalSteps });
        setResults([...allResults]);
      }

      if (abortRef.current) break;
    }

    setRunning(false);
    setRunProgress(null);
  }, [rows, columns, mode, sharedPrompt, sharedModel, sharedProvider, apiKeys, providers, pricingMap, detectedVars]);

  const handleAbort = useCallback(() => {
    abortRef.current = true;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const hasVars = detectedVars.length > 0;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconVariable size={18} color="#9775fa" />
          <Text fw={600} size="sm" style={{ color: '#C1C2C5' }}>Variable Interpolation</Text>
          {hasVars && (
            <Badge size="sm" variant="light" color="violet">{detectedVars.length} variable{detectedVars.length !== 1 ? 's' : ''}</Badge>
          )}
        </Box>
      }
      position="right"
      size="xl"
      overlayProps={{ backgroundOpacity: 0.4, blur: 2 }}
      styles={{
        content: { background: '#1A1B1E', display: 'flex', flexDirection: 'column' },
        header: { background: '#1A1B1E', borderBottom: '1px solid rgba(255,255,255,0.06)' },
        body: { flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', overflow: 'auto' },
      }}
    >
      {/* ── No Variables State ── */}
      {!hasVars && (
        <Box style={{ textAlign: 'center', padding: '40px 20px' }}>
          <IconVariable size={40} color="#5c5f66" style={{ marginBottom: 12 }} />
          <Text size="sm" style={{ color: '#909296', marginBottom: 8 }}>No variables detected</Text>
          <Text size="xs" style={{ color: '#5c5f66' }}>
            Use {'{{variable_name}}'} syntax in your prompts to define variables.
            {mode === 'models'
              ? ' Edit the shared prompt above.'
              : ' Edit the per-column prompts above.'}
          </Text>
        </Box>
      )}

      {/* ── Variables Detected ── */}
      {hasVars && (
        <Box style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          {/* Detected variables */}
          <Box>
            <Text size="xs" fw={600} style={{ color: '#909296', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              Detected Variables
            </Text>
            <Box style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detectedVars.map((v) => (
                <Badge key={v} size="sm" variant="light" color="violet" style={{ fontFamily: 'monospace' }}>
                  {`{{${v}}}`}
                </Badge>
              ))}
            </Box>
          </Box>

          {/* CSV Paste */}
          <Box>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconClipboard size={13} />}
              onClick={() => setShowCsvPaste((v) => !v)}
              style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, marginBottom: showCsvPaste ? 8 : 0 }}
            >
              Paste CSV
            </Button>
            {showCsvPaste && (
              <Box>
                <Textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.currentTarget.value)}
                  placeholder={`Paste tab or comma-separated data.\nOptional header row: ${detectedVars.join(', ')}\nThen one row per line with values.`}
                  minRows={4}
                  maxRows={8}
                  autosize
                  styles={{
                    input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#C1C2C5', fontSize: 12, fontFamily: 'monospace' },
                  }}
                />
                <Box style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button size="xs" color="violet" onClick={handlePasteCSV} disabled={!csvText.trim()}>
                    Import
                  </Button>
                  <Button size="xs" variant="subtle" color="gray" onClick={() => { setShowCsvPaste(false); setCsvText(''); }}>
                    Cancel
                  </Button>
                </Box>
              </Box>
            )}
          </Box>

          {/* Data Table */}
          <Box style={{ flex: 1, overflow: 'auto' }}>
            <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text size="xs" fw={600} style={{ color: '#909296', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Data Table ({rows.length} row{rows.length !== 1 ? 's' : ''})
              </Text>
              <Box style={{ display: 'flex', gap: 6 }}>
                <Tooltip label="Add row">
                  <Button size="xs" variant="subtle" color="violet" leftSection={<IconPlus size={12} />} onClick={addRow}
                    style={{ border: '1px solid rgba(151,117,250,0.2)', borderRadius: 6 }}
                  >
                    Add Row
                  </Button>
                </Tooltip>
                {rows.length > 0 && (
                  <Tooltip label="Clear all rows and results">
                    <Button size="xs" variant="subtle" color="red" leftSection={<IconClearAll size={12} />} onClick={clearAll}
                      style={{ border: '1px solid rgba(250,82,82,0.2)', borderRadius: 6 }}
                    >
                      Clear All
                    </Button>
                  </Tooltip>
                )}
              </Box>
            </Box>

            {rows.length > 0 && (
              <Box style={{ overflowX: 'auto' }}>
                <Table
                  horizontalSpacing="sm"
                  verticalSpacing={6}
                  styles={{
                    table: { borderCollapse: 'separate', borderSpacing: 0 },
                    th: { color: '#909296', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '6px 8px' },
                    td: { borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '4px 8px' },
                  }}
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 36 }}>#</Table.Th>
                      {detectedVars.map((v) => (
                        <Table.Th key={v} style={{ fontFamily: 'monospace' }}>{v}</Table.Th>
                      ))}
                      <Table.Th style={{ width: 36 }} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((row, rowIdx) => (
                      <Table.Tr key={rowIdx}>
                        <Table.Td>
                          <Text size="xs" style={{ color: '#5c5f66' }}>{rowIdx + 1}</Text>
                        </Table.Td>
                        {detectedVars.map((v) => (
                          <Table.Td key={v}>
                            <TextInput
                              value={row[v] ?? ''}
                              onChange={(e) => updateCell(rowIdx, v, e.currentTarget.value)}
                              size="xs"
                              disabled={running}
                              styles={{
                                input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#C1C2C5', fontSize: 12 },
                              }}
                            />
                          </Table.Td>
                        ))}
                        <Table.Td>
                          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => deleteRow(rowIdx)} disabled={running}>
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
            )}

            {rows.length === 0 && (
              <Box style={{ textAlign: 'center', padding: '24px 16px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 8 }}>
                <Text size="xs" style={{ color: '#5c5f66' }}>
                  No rows yet. Click "Add Row" or paste CSV data.
                </Text>
              </Box>
            )}
          </Box>

          {/* Run Controls */}
          <Box style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
            {running && runProgress && (
              <Box style={{ marginBottom: 10 }}>
                <Box style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text size="xs" style={{ color: '#9775fa' }}>
                    Running row {Math.floor(runProgress.current / Math.max(columns.length, 1)) + 1} of {rows.length}...
                  </Text>
                  <Text size="xs" style={{ color: '#909296' }}>
                    {runProgress.current} / {runProgress.total} steps
                  </Text>
                </Box>
                <Progress
                  value={(runProgress.current / runProgress.total) * 100}
                  color="violet"
                  size="sm"
                  animated
                  styles={{ root: { background: 'rgba(255,255,255,0.06)' } }}
                />
              </Box>
            )}
            <Box style={{ display: 'flex', gap: 8 }}>
              {!running ? (
                <Button
                  color="violet"
                  size="sm"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={handleRunAll}
                  disabled={rows.length === 0}
                  style={{ flex: 1 }}
                >
                  Run All Rows ({rows.length})
                </Button>
              ) : (
                <Button
                  color="red"
                  variant="light"
                  size="sm"
                  leftSection={<IconPlayerStop size={14} />}
                  onClick={handleAbort}
                  style={{ flex: 1 }}
                >
                  Abort
                </Button>
              )}
            </Box>
          </Box>

          {/* Results */}
          {results.length > 0 && results.some((r) => r.length > 0) && (
            <Box style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
              <Text size="xs" fw={600} style={{ color: '#909296', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Results
              </Text>
              {results.map((rowResults, rowIdx) => {
                const rowVars = rows[rowIdx];
                const varSummary = rowVars
                  ? detectedVars.map((v) => `${v}=${rowVars[v] ?? ''}`).join(', ')
                  : '';

                return rowResults.length > 0 ? (
                  <Box
                    key={rowIdx}
                    style={{
                      marginBottom: 12,
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}
                  >
                    <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Badge size="xs" variant="light" color="violet">Row {rowIdx + 1}</Badge>
                      <Text size="xs" style={{ color: '#5c5f66', fontFamily: 'monospace' }}>{varSummary}</Text>
                    </Box>
                    {rowResults.map((res, colIdx) => (
                      <Box
                        key={colIdx}
                        style={{
                          marginBottom: colIdx < rowResults.length - 1 ? 8 : 0,
                          paddingBottom: colIdx < rowResults.length - 1 ? 8 : 0,
                          borderBottom: colIdx < rowResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        }}
                      >
                        <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Badge size="xs" variant="outline" color="gray">Col {res.columnLabel}</Badge>
                          <Text size="xs" style={{ color: '#5c5f66' }}>
                            {res.inputTokens + res.outputTokens > 0
                              ? `${res.inputTokens.toLocaleString()} in / ${res.outputTokens.toLocaleString()} out`
                              : ''}
                          </Text>
                          {res.cost != null && (
                            <Text size="xs" style={{ color: '#20c997' }}>{formatCost(res.cost)}</Text>
                          )}
                          <Text size="xs" style={{ color: '#5c5f66' }}>{(res.latencyMs / 1000).toFixed(2)}s</Text>
                        </Box>
                        <Text
                          size="xs"
                          style={{
                            color: res.response.startsWith('Error:') ? '#fa5252' : '#C1C2C5',
                            whiteSpace: 'pre-wrap',
                            maxHeight: 120,
                            overflow: 'auto',
                            lineHeight: 1.5,
                            background: 'rgba(255,255,255,0.02)',
                            padding: '6px 8px',
                            borderRadius: 4,
                            border: '1px solid rgba(255,255,255,0.04)',
                          }}
                        >
                          {res.response.length > 500 ? res.response.slice(0, 500) + '...' : res.response}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                ) : null;
              })}
            </Box>
          )}
        </Box>
      )}
    </Drawer>
  );
}
