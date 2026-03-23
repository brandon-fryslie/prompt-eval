// [LAW:one-source-of-truth] Test suite management UI — single component owns suite CRUD and run orchestration

import {
  Drawer, TextInput, Textarea, Text, Box, Badge, ActionIcon, Tooltip, Loader, Button, Table, Progress, Collapse,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconSearch, IconTrash, IconPlus, IconPlayerPlay, IconChevronDown, IconChevronRight,
  IconEdit, IconCheck, IconX, IconClock, IconCoin, IconListCheck,
} from '@tabler/icons-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listSuites, saveSuite, deleteSuite, listRunResults, deleteRunResult, saveRunResult, aggregateResults,
  type TestSuite, type TestSuiteRunResult, type TestSuiteRunPromptResult, type TestSuiteRunColumnResult,
} from '../testSuiteDb';
import {
  createClient, runPrompt, evaluateWithRubric, calcCost, formatCost,
  type PricingMap, type Provider, type RubricDimension, type ChatMessage,
} from '../openai';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ColumnInfo {
  id: string;
  model: string;
  provider: string;
  prompt: string;
}

export interface TestSuiteDrawerProps {
  opened: boolean;
  onClose: () => void;
  apiKeys: Record<string, string>;
  columns: ColumnInfo[];
  mode: 'models' | 'prompts';
  sharedModel: string;
  sharedProvider: string;
  providers: Record<string, Provider>;
  pricingMap: PricingMap;
  rubricEnabled: boolean;
  rubricDimensions: RubricDimension[];
}

const COLUMN_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ── Component ─────────────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'edit' | 'run-result';

export function TestSuiteDrawer({
  opened, onClose, apiKeys, columns, mode, sharedModel, sharedProvider,
  providers, pricingMap, rubricEnabled, rubricDimensions,
}: TestSuiteDrawerProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [runs, setRuns] = useState<TestSuiteRunResult[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>('list');

  // Create/edit form state
  const [formName, setFormName] = useState('');
  const [formPrompts, setFormPrompts] = useState('');
  const [editingSuiteId, setEditingSuiteId] = useState<string | null>(null);

  // Run state
  const [runningSuiteId, setRunningSuiteId] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState<{ current: number; total: number } | null>(null);
  const abortRef = useRef(false);

  // View state
  const [expandedSuiteId, setExpandedSuiteId] = useState<string | null>(null);
  const [viewingRun, setViewingRun] = useState<TestSuiteRunResult | null>(null);
  const [expandedPromptIdx, setExpandedPromptIdx] = useState<number | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([listSuites(), listRunResults()])
      .then(([s, r]) => { setSuites(s); setRuns(r); })
      .catch(() => { setSuites([]); setRuns([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!opened) return;
    refresh();
    setView('list');
    setViewingRun(null);
    setExpandedSuiteId(null);
  }, [opened, refresh]);

  // ── Filtered suites ───────────────────────────────────────────────────────

  const filtered = suites.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const handleCreateNew = () => {
    setFormName('');
    setFormPrompts('');
    setEditingSuiteId(null);
    setView('create');
  };

  const handleEditSuite = (suite: TestSuite, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormName(suite.name);
    setFormPrompts(suite.prompts.join('\n'));
    setEditingSuiteId(suite.id);
    setView('edit');
  };

  const handleSaveForm = () => {
    const name = formName.trim();
    const prompts = formPrompts.split('\n').map((p) => p.trim()).filter(Boolean);
    if (!name) {
      notifications.show({ title: 'Name Required', message: 'Enter a name for the test suite', color: 'orange' });
      return;
    }
    if (prompts.length === 0) {
      notifications.show({ title: 'Prompts Required', message: 'Enter at least one prompt', color: 'orange' });
      return;
    }

    const suite: TestSuite = {
      id: editingSuiteId ?? crypto.randomUUID(),
      name,
      prompts,
      createdAt: editingSuiteId ? (suites.find((s) => s.id === editingSuiteId)?.createdAt ?? Date.now()) : Date.now(),
    };

    saveSuite(suite)
      .then(() => { refresh(); setView('list'); })
      .catch((err) => {
        notifications.show({ title: 'Save Failed', message: err instanceof Error ? err.message : 'Unknown error', color: 'red' });
      });
  };

  const handleDeleteSuite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSuite(id)
      .then(() => setSuites((prev) => prev.filter((s) => s.id !== id)))
      .catch(() => {});
  };

  const handleDeleteRun = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteRunResult(id)
      .then(() => {
        setRuns((prev) => prev.filter((r) => r.id !== id));
        if (viewingRun?.id === id) { setViewingRun(null); setView('list'); }
      })
      .catch(() => {});
  };

  // ── Run execution ─────────────────────────────────────────────────────────

  // [LAW:single-enforcer] One place for test suite execution logic
  const handleRunSuite = useCallback(async (suite: TestSuite) => {
    // [LAW:one-source-of-truth] Determine effective configs per column
    // In prompts mode, all columns share the same model/provider — use a single column to avoid duplicate results
    const activeColumns = mode === 'prompts'
      ? [{ idx: 0, model: sharedModel, provider: sharedProvider, label: COLUMN_LABELS[0] ?? '1' }]
      : columns.map((col, idx) => ({
          idx, model: col.model, provider: col.provider, label: COLUMN_LABELS[idx] ?? `${idx + 1}`,
        }));

    // Validate API keys
    const neededProviders = new Set(activeColumns.map((c) => c.provider));
    if (rubricEnabled) neededProviders.add('openai'); // eval uses openai
    const missingProviders = [...neededProviders].filter((p) => !apiKeys[p]?.trim());
    if (missingProviders.length > 0) {
      const names = missingProviders.map((p) => providers[p]?.name ?? p).join(', ');
      notifications.show({ title: 'API Key Required', message: `Missing API key for: ${names}`, color: 'red' });
      return;
    }

    if (activeColumns.length === 0) {
      notifications.show({ title: 'No Columns', message: 'Configure at least one column', color: 'orange' });
      return;
    }

    setRunningSuiteId(suite.id);
    setRunProgress({ current: 0, total: suite.prompts.length });
    abortRef.current = false;

    const promptResults: TestSuiteRunPromptResult[] = [];

    for (let pi = 0; pi < suite.prompts.length; pi++) {
      if (abortRef.current) break;
      setRunProgress({ current: pi + 1, total: suite.prompts.length });
      const promptText = suite.prompts[pi];

      // Run all columns in parallel for this prompt
      const columnResults: TestSuiteRunColumnResult[] = await Promise.all(
        activeColumns.map(async (colCfg) => {
          const client = createClient({
            apiKey: apiKeys[colCfg.provider]!.trim(),
            baseUrl: providers[colCfg.provider]?.baseUrl,
          });
          const messages: ChatMessage[] = [{ role: 'user', content: promptText }];
          const startTime = Date.now();
          try {
            // [LAW:dataflow-not-control-flow] Always run, let data (result) carry success/failure info
            const result = await runPrompt(client, colCfg.model, messages, () => {}, () => {});
            const endTime = Date.now();
            const cost = calcCost(colCfg.model, result.inputTokens, result.outputTokens, pricingMap);
            return {
              columnIndex: colCfg.idx,
              response: result.text,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              cost,
              latencyMs: endTime - startTime,
            };
          } catch {
            return {
              columnIndex: colCfg.idx,
              response: '',
              inputTokens: 0,
              outputTokens: 0,
              cost: null,
              latencyMs: null,
            };
          }
        })
      );

      // Rubric evaluation for this prompt if enabled
      let rubricScores = undefined;
      if (rubricEnabled && rubricDimensions.length > 0 && columnResults.filter((c) => c.response).length >= 2) {
        const entries = columnResults
          .filter((c) => c.response)
          .map((c) => ({
            label: activeColumns[c.columnIndex]?.label ?? `${c.columnIndex + 1}`,
            prompt: promptText,
            response: c.response,
          }));

        const evalClient = createClient({
          apiKey: apiKeys['openai']!.trim(),
          baseUrl: providers['openai']?.baseUrl,
        });

        try {
          const { scores } = await evaluateWithRubric(evalClient, 'gpt-4.1', entries, rubricDimensions, () => {});
          rubricScores = scores;
        } catch {
          // Rubric eval failure is non-fatal
        }
      }

      promptResults.push({
        promptIndex: pi,
        promptText,
        columns: columnResults,
        rubricScores,
      });
    }

    // Aggregate
    const columnLabels = activeColumns.map((c) => c.label);
    const aggregated = aggregateResults(promptResults, activeColumns.length, columnLabels);

    const runResult: TestSuiteRunResult = {
      id: crypto.randomUUID(),
      suiteId: suite.id,
      suiteName: suite.name,
      timestamp: Date.now(),
      mode,
      columnConfigs: activeColumns.map((c) => ({ model: c.model, provider: c.provider, label: c.label })),
      results: promptResults,
      aggregated,
    };

    await saveRunResult(runResult).catch(() => {
      notifications.show({ title: 'Warning', message: 'Suite run completed but results could not be saved', color: 'orange' });
    });
    setRunningSuiteId(null);
    setRunProgress(null);
    refresh();

    notifications.show({
      title: 'Suite Run Complete',
      message: `${suite.name}: ${promptResults.length} prompts across ${activeColumns.length} columns`,
      color: 'green',
    });
  }, [columns, mode, sharedModel, sharedProvider, apiKeys, providers, pricingMap, rubricEnabled, rubricDimensions, refresh]);

  // ── Helpers for rendering ─────────────────────────────────────────────────

  const runsForSuite = (suiteId: string) => runs.filter((r) => r.suiteId === suiteId);

  const bestValue = (values: (number | null)[], direction: 'min' | 'max'): number | null => {
    const valid = values.filter((v): v is number => v != null);
    if (valid.length === 0) return null;
    return direction === 'min' ? Math.min(...valid) : Math.max(...valid);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const renderFormView = () => (
    <Box style={{ padding: '12px 0' }}>
      <Text size="sm" fw={600} style={{ color: '#C1C2C5', marginBottom: 12 }}>
        {view === 'edit' ? 'Edit Test Suite' : 'New Test Suite'}
      </Text>
      <TextInput
        label="Suite Name"
        placeholder="e.g., Summarization Benchmark"
        value={formName}
        onChange={(e) => setFormName(e.currentTarget.value)}
        size="sm"
        mb={12}
        styles={{
          input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#C1C2C5' },
          label: { color: '#909296', fontSize: 12, marginBottom: 4 },
        }}
      />
      <Textarea
        label="Prompts (one per line)"
        placeholder={"Summarize the theory of relativity in 3 sentences.\nExplain quantum computing to a 10-year-old.\nWrite a haiku about machine learning."}
        value={formPrompts}
        onChange={(e) => setFormPrompts(e.currentTarget.value)}
        minRows={8}
        maxRows={20}
        autosize
        size="sm"
        mb={12}
        styles={{
          input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#C1C2C5', fontFamily: 'monospace', fontSize: 12 },
          label: { color: '#909296', fontSize: 12, marginBottom: 4 },
        }}
      />
      <Text size="xs" c="dimmed" mb={12}>
        {formPrompts.split('\n').filter((l) => l.trim()).length} prompt(s)
      </Text>
      <Box style={{ display: 'flex', gap: 8 }}>
        <Button
          variant="light" color="violet" size="xs" leftSection={<IconCheck size={13} />}
          onClick={handleSaveForm} style={{ flex: 1 }}
        >
          Save
        </Button>
        <Button
          variant="subtle" color="gray" size="xs" leftSection={<IconX size={13} />}
          onClick={() => setView('list')} style={{ flex: 1 }}
        >
          Cancel
        </Button>
      </Box>
    </Box>
  );

  const renderRunResultView = () => {
    if (!viewingRun) return null;
    const run = viewingRun;
    const { aggregated, results, columnConfigs } = run;

    // Find best values for highlighting
    const costs = aggregated.perColumn.map((c) => c.totalCost);
    const latencies = aggregated.perColumn.map((c) => c.avgLatencyMs);
    const bestCost = bestValue(costs, 'min');
    const bestLatency = bestValue(latencies, 'min');

    // Collect all rubric dimension names
    const rubricDims = new Set<string>();
    for (const col of aggregated.perColumn) {
      if (col.avgRubricScores) Object.keys(col.avgRubricScores).forEach((d) => rubricDims.add(d));
    }
    const dimList = [...rubricDims];

    // Best rubric per dimension (highest)
    const bestRubricPerDim: Record<string, number> = {};
    for (const dim of dimList) {
      const scores = aggregated.perColumn.map((c) => c.avgRubricScores?.[dim] ?? null);
      const best = bestValue(scores, 'max');
      if (best != null) bestRubricPerDim[dim] = best;
    }

    return (
      <Box style={{ padding: '12px 0' }}>
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Button variant="subtle" color="gray" size="xs" onClick={() => { setViewingRun(null); setView('list'); }}>
            Back
          </Button>
          <Text size="sm" fw={600} style={{ color: '#C1C2C5' }} lineClamp={1}>
            {run.suiteName}
          </Text>
          <Text size="xs" c="dimmed">{formatRelativeTime(run.timestamp)}</Text>
        </Box>

        <Text size="xs" fw={600} style={{ color: '#909296', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Summary ({results.length} prompts, {columnConfigs.length} columns)
        </Text>

        {/* Summary table */}
        <Box style={{ overflowX: 'auto', marginBottom: 16 }}>
          <Table
            horizontalSpacing="xs" verticalSpacing={4} fz="xs"
            styles={{ table: { borderCollapse: 'collapse' }, th: { color: '#909296', borderBottom: '1px solid rgba(255,255,255,0.1)' }, td: { borderBottom: '1px solid rgba(255,255,255,0.05)' } }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Column</Table.Th>
                <Table.Th>Model</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Total Cost</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Avg Latency</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Tokens (in/out)</Table.Th>
                {dimList.map((dim) => (
                  <Table.Th key={dim} style={{ textAlign: 'right' }}>{dim}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {aggregated.perColumn.map((col, i) => {
                const cfg = columnConfigs[i];
                const isBestCost = col.totalCost != null && col.totalCost === bestCost;
                const isBestLatency = col.avgLatencyMs != null && col.avgLatencyMs === bestLatency;

                return (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <Badge size="xs" variant="light" color="violet">{cfg?.label ?? COLUMN_LABELS[i]}</Badge>
                    </Table.Td>
                    <Table.Td style={{ color: '#C1C2C5' }}>{cfg?.model ?? '?'}</Table.Td>
                    <Table.Td style={{ textAlign: 'right', color: isBestCost ? '#20c997' : '#C1C2C5', fontWeight: isBestCost ? 700 : 400 }}>
                      {col.totalCost != null ? formatCost(col.totalCost) : '-'}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right', color: isBestLatency ? '#20c997' : '#C1C2C5', fontWeight: isBestLatency ? 700 : 400 }}>
                      {col.avgLatencyMs != null ? `${Math.round(col.avgLatencyMs)}ms` : '-'}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right', color: '#909296' }}>
                      {col.totalInputTokens.toLocaleString()} / {col.totalOutputTokens.toLocaleString()}
                    </Table.Td>
                    {dimList.map((dim) => {
                      const score = col.avgRubricScores?.[dim];
                      const isBest = score != null && score === bestRubricPerDim[dim];
                      return (
                        <Table.Td key={dim} style={{ textAlign: 'right', color: isBest ? '#f59f00' : '#C1C2C5', fontWeight: isBest ? 700 : 400 }}>
                          {score != null ? score.toFixed(1) : '-'}
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Box>

        {/* Per-prompt drill-down */}
        <Text size="xs" fw={600} style={{ color: '#909296', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Per-Prompt Results
        </Text>
        <Box style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {results.map((pr) => {
            const isExpanded = expandedPromptIdx === pr.promptIndex;
            return (
              <Box key={pr.promptIndex}>
                <Box
                  onClick={() => setExpandedPromptIdx(isExpanded ? null : pr.promptIndex)}
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: `1px solid ${isExpanded ? 'rgba(121,80,242,0.3)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: 6,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {isExpanded ? <IconChevronDown size={12} color="#909296" /> : <IconChevronRight size={12} color="#909296" />}
                  <Badge size="xs" variant="light" color="gray">#{pr.promptIndex + 1}</Badge>
                  <Text size="xs" style={{ color: '#C1C2C5', flex: 1 }} lineClamp={1}>{pr.promptText}</Text>
                </Box>
                <Collapse in={isExpanded}>
                  <Box style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: '0 0 6px 6px', marginTop: -1 }}>
                    {pr.columns.map((cr) => {
                      const cfg = columnConfigs[cr.columnIndex];
                      return (
                        <Box key={cr.columnIndex} mb={8}>
                          <Box style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Badge size="xs" variant="light" color="violet">{cfg?.label ?? COLUMN_LABELS[cr.columnIndex]}</Badge>
                            <Text size="xs" c="dimmed">{cfg?.model}</Text>
                            {cr.cost != null && <Badge size="xs" variant="light" color="gray" leftSection={<IconCoin size={9} />}>{formatCost(cr.cost)}</Badge>}
                            {cr.latencyMs != null && <Badge size="xs" variant="light" color="gray" leftSection={<IconClock size={9} />}>{Math.round(cr.latencyMs)}ms</Badge>}
                          </Box>
                          <Text size="xs" style={{ color: '#6b7280', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
                            {cr.response || '(no response)'}
                          </Text>
                        </Box>
                      );
                    })}
                    {pr.rubricScores && (
                      <Box mt={4} pt={4} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <Text size="xs" fw={600} style={{ color: '#f59f00', marginBottom: 4 }}>Rubric Scores</Text>
                        {Object.entries(pr.rubricScores.columns).map(([label, dims]) => (
                          <Box key={label} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                            <Badge size="xs" variant="light" color="violet">{label}</Badge>
                            {Object.entries(dims).map(([dim, score]) => (
                              <Text key={dim} size="xs" c="dimmed">{dim}: {score}/5</Text>
                            ))}
                          </Box>
                        ))}
                        {pr.rubricScores.summary && (
                          <Text size="xs" c="dimmed" mt={4} style={{ fontStyle: 'italic' }}>{pr.rubricScores.summary}</Text>
                        )}
                      </Box>
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  const renderListView = () => (
    <Box style={{ padding: '12px 0' }}>
      <Box style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <TextInput
          placeholder="Search suites..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<IconSearch size={14} color="#5c5f66" />}
          size="sm"
          style={{ flex: 1 }}
          styles={{
            input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#C1C2C5' },
          }}
        />
        <Tooltip label="Create new test suite" position="bottom">
          <Button variant="light" color="violet" size="sm" leftSection={<IconPlus size={14} />} onClick={handleCreateNew}>
            New
          </Button>
        </Tooltip>
      </Box>

      {/* Running progress */}
      {runProgress && (
        <Box mb={12} style={{ background: 'rgba(121,80,242,0.08)', border: '1px solid rgba(121,80,242,0.2)', borderRadius: 8, padding: '10px 12px' }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Loader size={14} color="violet" />
            <Text size="xs" fw={600} style={{ color: '#C1C2C5', flex: 1 }}>
              Running prompt {runProgress.current} of {runProgress.total}
            </Text>
            <Button
              variant="subtle" color="red" size="compact-xs"
              leftSection={<IconX size={11} />}
              onClick={() => { abortRef.current = true; }}
            >
              Cancel
            </Button>
          </Box>
          <Progress
            value={(runProgress.current / runProgress.total) * 100}
            size="sm" color="violet" radius="xl"
            styles={{ root: { background: 'rgba(255,255,255,0.06)' } }}
          />
        </Box>
      )}

      {loading && (
        <Box style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Loader size="sm" color="violet" />
        </Box>
      )}

      {!loading && filtered.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" style={{ padding: 32 }}>
          {suites.length === 0 ? 'No test suites yet. Create one to get started.' : 'No suites match your search.'}
        </Text>
      )}

      <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((suite) => {
          const suiteRuns = runsForSuite(suite.id);
          const isExpanded = expandedSuiteId === suite.id;
          const isRunning = runningSuiteId === suite.id;

          return (
            <Box
              key={suite.id}
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: `1px solid ${isExpanded ? 'rgba(121,80,242,0.3)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 8,
                padding: '10px 12px',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onClick={() => setExpandedSuiteId(isExpanded ? null : suite.id)}
              onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                e.currentTarget.style.borderColor = 'rgba(121,80,242,0.3)';
                e.currentTarget.style.background = 'rgba(121,80,242,0.04)';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                e.currentTarget.style.borderColor = isExpanded ? 'rgba(121,80,242,0.3)' : 'rgba(255,255,255,0.07)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
              }}
            >
              {/* Header */}
              <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text size="sm" fw={600} style={{ color: '#C1C2C5', lineHeight: 1.3 }} lineClamp={1}>
                  {suite.name}
                </Text>
                <Box style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <Tooltip label="Edit suite" position="left">
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={(e) => handleEditSuite(suite, e)}>
                      <IconEdit size={12} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete suite" position="left">
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={(e) => handleDeleteSuite(suite.id, e)}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Box>
              </Box>
              {/* Meta */}
              <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Badge size="xs" variant="light" color="blue">
                  {suite.prompts.length} prompt{suite.prompts.length !== 1 ? 's' : ''}
                </Badge>
                {suiteRuns.length > 0 && (
                  <Badge size="xs" variant="light" color="yellow">
                    {suiteRuns.length} run{suiteRuns.length !== 1 ? 's' : ''}
                  </Badge>
                )}
                <Text size="xs" c="dimmed" style={{ marginLeft: 'auto' }}>
                  {formatRelativeTime(suite.createdAt)}
                </Text>
              </Box>

              {/* Expanded: prompts preview + run button + past runs */}
              <Collapse in={isExpanded}>
                <Box
                  mt={10}
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  {/* Prompt previews */}
                  {suite.prompts.slice(0, 4).map((p, i) => (
                    <Text key={i} size="xs" style={{ color: '#6b7280', marginBottom: 2 }} lineClamp={1}>
                      <Text component="span" size="xs" fw={600} style={{ color: '#7950f2' }}>{i + 1}. </Text>
                      {p}
                    </Text>
                  ))}
                  {suite.prompts.length > 4 && (
                    <Text size="xs" c="dimmed" mb={4}>+{suite.prompts.length - 4} more...</Text>
                  )}

                  {/* Run button */}
                  <Button
                    variant="light" color="green" size="xs" fullWidth mt={8}
                    leftSection={<IconPlayerPlay size={13} />}
                    loading={isRunning}
                    disabled={!!runningSuiteId}
                    onClick={() => handleRunSuite(suite)}
                  >
                    Run Suite ({suite.prompts.length} prompts x {mode === 'prompts' ? 1 : columns.length} {mode === 'prompts' ? 'column' : 'columns'})
                  </Button>

                  {/* Past runs */}
                  {suiteRuns.length > 0 && (
                    <Box mt={10}>
                      <Text size="xs" fw={600} style={{ color: '#909296', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                        Past Runs
                      </Text>
                      {suiteRuns.map((run) => (
                        <Box
                          key={run.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '4px 8px', borderRadius: 4,
                            background: 'rgba(255,255,255,0.02)',
                            cursor: 'pointer',
                            marginBottom: 4,
                          }}
                          onClick={() => { setViewingRun(run); setView('run-result'); setExpandedPromptIdx(null); }}
                          onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'rgba(121,80,242,0.06)'; }}
                          onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                        >
                          <Text size="xs" style={{ color: '#C1C2C5', flex: 1 }}>
                            {run.results.length} prompts, {run.columnConfigs.length} cols
                          </Text>
                          <Text size="xs" c="dimmed">{formatRelativeTime(run.timestamp)}</Text>
                          <Tooltip label="Delete run" position="left">
                            <ActionIcon size="xs" variant="subtle" color="gray" onClick={(e) => handleDeleteRun(run.id, e)}>
                              <IconTrash size={10} />
                            </ActionIcon>
                          </Tooltip>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  // ── View dispatch ─────────────────────────────────────────────────────────
  // [LAW:dataflow-not-control-flow] All views render; visibility determined by data (current view)
  const viewContent: Record<View, () => React.ReactNode> = {
    list: renderListView,
    create: renderFormView,
    edit: renderFormView,
    'run-result': renderRunResultView,
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <IconListCheck size={16} color="#7950f2" />
          <Text fw={700} size="sm" style={{ color: '#C1C2C5' }}>Test Suites</Text>
          <Badge size="xs" variant="light" color="violet">{suites.length}</Badge>
        </Box>
      }
      position="right"
      size="lg"
      styles={{
        content: { background: '#1A1B1E' },
        header: { background: '#1A1B1E', borderBottom: '1px solid rgba(255,255,255,0.06)' },
        title: { width: '100%' },
        close: { color: '#909296' },
      }}
    >
      {viewContent[view]()}
    </Drawer>
  );
}
