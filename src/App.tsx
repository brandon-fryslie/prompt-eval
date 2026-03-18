import {
  Box,
  TextInput,
  Button,
  Group,
  Switch,
  Text,
  Paper,
  Divider,
  Badge,
  ActionIcon,
  Tooltip,
  Collapse,
  Alert,
} from '@mantine/core';
import {
  IconBolt,
  IconKey,
  IconEye,
  IconEyeOff,
  IconBrain,
  IconAlertCircle,
  IconTrash,
  IconSparkles,
  IconDeviceFloppy,
  IconPlus,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useState, useCallback, useEffect } from 'react';
import { GeometricCanvas } from './components/GeometricCanvas';
import { PromptPanel } from './components/PromptPanel';
import { MarkdownOutput } from './components/MarkdownOutput';
import {
  createClient,
  runPrompt,
  evaluateResponses,
  fetchModels,
  calcCost,
  type ModelGroup,
  type PricingMap,
  type RunResult,
} from './openai';

// ── Column types ──────────────────────────────────────────────────────────────

interface ColumnConfig {
  id: string;
  model: string;
  prompt: string;
  preprocessEnabled: boolean;
  preprocessPrompt: string;
}

interface ColumnRunState {
  response: string;
  preprocessResult: string;
  isStreaming: boolean;
  isPreprocessing: boolean;
  inputTokens: number;
  outputTokens: number;
}

const emptyRunState = (): ColumnRunState => ({
  response: '', preprocessResult: '',
  isStreaming: false, isPreprocessing: false,
  inputTokens: 0, outputTokens: 0,
});

const COLUMN_COLORS = ['#7950f2', '#228be6', '#20c997', '#f59f00', '#fa5252', '#e64980'];
const COLUMN_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DEFAULT_MODEL = 'gpt-4.1';
const EVAL_MODEL = 'gpt-4.1';

function makeColumn(model = DEFAULT_MODEL): ColumnConfig {
  return { id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, model, prompt: '', preprocessEnabled: false, preprocessPrompt: '' };
}

// ── Persistence ───────────────────────────────────────────────────────────────

const KEYS = {
  persist:  'pe-persist',
  apiKey:   'pe-api-key',
  columns:  'pe-columns-v2',
  eval:     'pe-eval-enabled',
} as const;

const persistedOnLoad = sessionStorage.getItem(KEYS.persist) === 'true';
const ss = (key: string, fallback: string) =>
  persistedOnLoad ? (sessionStorage.getItem(key) ?? fallback) : fallback;

const defaultColumns: ColumnConfig[] = [
  makeColumn('gpt-4.1'),
  makeColumn('gpt-4.1-mini'),
];

function loadColumns(): ColumnConfig[] {
  try {
    const raw = ss(KEYS.columns, '');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return defaultColumns;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [persist, setPersist] = useState(persistedOnLoad);
  const [apiKey, setApiKey] = useState(() => ss(KEYS.apiKey, ''));
  const [showKey, setShowKey] = useState(false);
  const [evalEnabled, setEvalEnabled] = useState(() => ss(KEYS.eval, 'false') === 'true');

  const [columns, setColumns] = useState<ColumnConfig[]>(loadColumns);
  const [runStates, setRunStates] = useState<Record<string, ColumnRunState>>({});

  const [evalResponse, setEvalResponse] = useState('');
  const [streamingEval, setStreamingEval] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [autoCollapse, setAutoCollapse] = useState(false);
  const [error, setError] = useState('');

  const [models, setModels] = useState<ModelGroup[]>([]);
  const [pricingMap, setPricingMap] = useState<PricingMap>({});
  const [modelsLoading, setModelsLoading] = useState(true);

  // Fetch model list on mount
  useEffect(() => {
    fetchModels()
      .then(({ groups, pricingMap }) => { setModels(groups); setPricingMap(pricingMap); })
      .catch(() => { /* fall back to empty — user can still type a model id */ })
      .finally(() => setModelsLoading(false));
  }, []);

  // ── Persistence helpers ────────────────────────────────────────────────────

  const save = useCallback((key: string, value: string) => {
    if (persist) sessionStorage.setItem(key, value);
  }, [persist]);

  const saveColumns = useCallback((cols: ColumnConfig[]) => {
    if (persist) sessionStorage.setItem(KEYS.columns, JSON.stringify(cols));
  }, [persist]);

  const handlePersistToggle = (on: boolean) => {
    setPersist(on);
    sessionStorage.setItem(KEYS.persist, String(on));
    if (on) {
      sessionStorage.setItem(KEYS.apiKey,  apiKey);
      sessionStorage.setItem(KEYS.columns, JSON.stringify(columns));
      sessionStorage.setItem(KEYS.eval,    String(evalEnabled));
    } else {
      Object.values(KEYS).forEach((k) => k !== KEYS.persist && sessionStorage.removeItem(k));
    }
  };

  // ── Column management ──────────────────────────────────────────────────────

  const updateColumn = useCallback((id: string, patch: Partial<ColumnConfig>) => {
    setColumns((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, ...patch } : c);
      saveColumns(next);
      return next;
    });
  }, [saveColumns]);

  const addColumn = () => {
    const last = columns[columns.length - 1];
    const col = makeColumn(last?.model ?? DEFAULT_MODEL);
    setColumns((prev) => { const next = [...prev, col]; saveColumns(next); return next; });
  };

  const removeColumn = (id: string) => {
    setColumns((prev) => { const next = prev.filter((c) => c.id !== id); saveColumns(next); return next; });
    setRunStates((prev) => { const { [id]: _, ...rest } = prev; return rest; });
  };

  // ── Run state helpers ──────────────────────────────────────────────────────

  const appendField = useCallback((id: string, field: 'response' | 'preprocessResult', delta: string) => {
    setRunStates((prev) => {
      const col = prev[id] ?? emptyRunState();
      return { ...prev, [id]: { ...col, [field]: col[field] + delta } };
    });
  }, []);

  const setField = useCallback(<K extends keyof ColumnRunState>(id: string, field: K, value: ColumnRunState[K]) => {
    setRunStates((prev) => {
      const col = prev[id] ?? emptyRunState();
      return { ...prev, [id]: { ...col, [field]: value } };
    });
  }, []);

  // ── Run logic ──────────────────────────────────────────────────────────────

  const runColumn = useCallback(
    async (col: ColumnConfig, client: ReturnType<typeof createClient>): Promise<[string, RunResult]> => {
      let effectivePrompt = col.prompt;

      if (col.preprocessEnabled && col.preprocessPrompt.trim()) {
        const combined = `${col.preprocessPrompt.trim()}\n\n${col.prompt}`;
        setField(col.id, 'isPreprocessing', true);
        try {
          const result = await runPrompt(client, col.model, combined, (d) => appendField(col.id, 'preprocessResult', d));
          effectivePrompt = result.text;
        } finally {
          setField(col.id, 'isPreprocessing', false);
        }
      }

      setField(col.id, 'isStreaming', true);
      try {
        const result = await runPrompt(client, col.model, effectivePrompt, (d) => appendField(col.id, 'response', d));
        setRunStates((prev) => ({
          ...prev,
          [col.id]: { ...(prev[col.id] ?? emptyRunState()), isStreaming: false, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        }));
        return [effectivePrompt, result];
      } catch (err) {
        setField(col.id, 'isStreaming', false);
        throw err;
      }
    },
    [appendField, setField],
  );

  const handleRun = useCallback(async () => {
    if (!apiKey.trim()) {
      notifications.show({ title: 'API Key Required', message: 'Please enter your OpenAI API key', color: 'red', icon: <IconAlertCircle size={16} /> });
      return;
    }
    const active = columns.filter((c) => c.prompt.trim());
    if (!active.length) {
      notifications.show({ title: 'No Prompts', message: 'Enter at least one prompt', color: 'orange' });
      return;
    }

    setError(''); setIsRunning(true); setAutoCollapse(true);
    setRunStates({});
    setEvalResponse('');

    const client = createClient(apiKey.trim());
    try {
      const results = await Promise.all(active.map((col) => runColumn(col, client)));

      if (evalEnabled && results.length >= 2) {
        const entries = results
          .map(([effPrompt, result], i) => ({
            label: `Column ${COLUMN_LABELS[columns.findIndex((c) => c.id === active[i].id)] ?? i + 1}`,
            prompt: effPrompt || active[i].prompt,
            response: result.text,
          }))
          .filter((e) => e.response);

        if (entries.length >= 2) {
          setStreamingEval(true);
          await evaluateResponses(client, EVAL_MODEL, entries, (d) => setEvalResponse((p) => p + d))
            .finally(() => setStreamingEval(false));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      notifications.show({ title: 'Error', message: msg, color: 'red', icon: <IconAlertCircle size={16} /> });
    } finally {
      setIsRunning(false); setAutoCollapse(false);
    }
  }, [apiKey, columns, evalEnabled, runColumn]);

  const handleClear = () => {
    setRunStates({});
    setEvalResponse('');
    setError('');
  };

  const hasAnyResponse = columns.some((c) => runStates[c.id]?.response);

  return (
    <Box style={{ position: 'relative', minHeight: '100vh' }}>
      <GeometricCanvas />

      <Box style={{ position: 'relative', zIndex: 1, maxWidth: columns.length > 2 ? '100%' : 1400, margin: '0 auto', padding: '16px 24px 64px' }}>

        {/* ── HEADER BAR ── */}
        <Paper style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 18px', marginBottom: 16, backdropFilter: 'blur(16px)' }}>
          <Box style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>

            {/* Logo */}
            <Box style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Box style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, #7950f2, #9775fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 14px rgba(121,80,242,0.45)' }}>
                <IconSparkles size={14} color="white" />
              </Box>
              <Text style={{ fontSize: 15, fontWeight: 700, background: 'linear-gradient(135deg, #9775fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em', lineHeight: 1 }}>
                PromptEval
              </Text>
            </Box>

            <Box style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

            {/* API Key */}
            <Box style={{ flex: 1, minWidth: 220 }}>
              <TextInput
                placeholder="OpenAI API key  sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.currentTarget.value)}
                onBlur={(e) => save(KEYS.apiKey, e.currentTarget.value)}
                type={showKey ? 'text' : 'password'}
                size="xs"
                leftSection={<IconKey size={12} color="#5c5f66" />}
                rightSection={
                  <Tooltip label={showKey ? 'Hide' : 'Show'} position="top">
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setShowKey((v) => !v)}>
                      {showKey ? <IconEyeOff size={12} /> : <IconEye size={12} />}
                    </ActionIcon>
                  </Tooltip>
                }
                styles={{ input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#C1C2C5', fontSize: 13 } }}
              />
            </Box>

            {/* AI Eval toggle */}
            <Switch
              label={
                <Box style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <IconBrain size={12} color={evalEnabled ? '#9775fa' : '#5c5f66'} />
                  <Text size="xs" style={{ color: evalEnabled ? '#9775fa' : '#5c5f66' }}>AI Eval</Text>
                </Box>
              }
              checked={evalEnabled}
              onChange={(e) => { setEvalEnabled(e.currentTarget.checked); save(KEYS.eval, String(e.currentTarget.checked)); }}
              color="violet"
              size="xs"
              styles={{ track: { background: evalEnabled ? undefined : 'rgba(255,255,255,0.1)', border: 'none' } }}
            />

            {/* Save session toggle */}
            <Tooltip label="Session data is saved only in your browser and cleared when the tab closes" position="bottom" multiline w={260}>
              <Box>
                <Switch
                  label={
                    <Box style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <IconDeviceFloppy size={12} color={persist ? '#20c997' : '#5c5f66'} />
                      <Text size="xs" style={{ color: persist ? '#20c997' : '#5c5f66' }}>Save session</Text>
                    </Box>
                  }
                  checked={persist}
                  onChange={(e) => handlePersistToggle(e.currentTarget.checked)}
                  color="teal"
                  size="xs"
                  styles={{ track: { background: persist ? undefined : 'rgba(255,255,255,0.1)', border: 'none' } }}
                />
              </Box>
            </Tooltip>

            {/* Actions */}
            <Group gap={6} style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <Tooltip label="Add column">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={addColumn}
                  disabled={isRunning || columns.length >= 6}
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <IconPlus size={14} />
                </ActionIcon>
              </Tooltip>

              {hasAnyResponse && (
                <Tooltip label="Clear results">
                  <ActionIcon variant="subtle" color="gray" size="sm" onClick={handleClear} disabled={isRunning}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              )}

              <Button
                leftSection={<IconBolt size={14} />}
                onClick={handleRun}
                loading={isRunning}
                size="xs"
                disabled={!apiKey.trim() || !columns.some((c) => c.prompt.trim())}
                style={{ background: isRunning ? undefined : 'linear-gradient(135deg, #7950f2, #9775fa)', border: 'none', fontWeight: 600, letterSpacing: '0.02em', boxShadow: isRunning ? undefined : '0 0 16px rgba(121,80,242,0.35)' }}
              >
                {isRunning ? 'Running…' : 'Run'}
              </Button>
            </Group>
          </Box>
        </Paper>

        {/* Error */}
        {error && (
          <Alert icon={<IconAlertCircle size={14} />} color="red" variant="light" mb={14} style={{ background: 'rgba(250,82,82,0.07)', border: '1px solid rgba(250,82,82,0.2)' }}>
            {error}
          </Alert>
        )}

        {/* ── COLUMNS ── */}
        <Box style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(300px, 1fr))`, gap: 18, overflowX: 'auto' }}>
          {columns.map((col, i) => {
            const rs = runStates[col.id] ?? emptyRunState();
            const cost = rs.inputTokens || rs.outputTokens
              ? calcCost(col.model, rs.inputTokens, rs.outputTokens, pricingMap)
              : null;
            return (
              <PromptPanel
                key={col.id}
                label={`Prompt ${COLUMN_LABELS[i] ?? i + 1}`}
                color={COLUMN_COLORS[i % COLUMN_COLORS.length]}
                model={col.model}
                onModelChange={(m) => updateColumn(col.id, { model: m })}
                models={models}
                modelsLoading={modelsLoading}
                preprocessEnabled={col.preprocessEnabled}
                onPreprocessEnabledChange={(v) => updateColumn(col.id, { preprocessEnabled: v })}
                preprocessPrompt={col.preprocessPrompt}
                onPreprocessPromptChange={(v) => updateColumn(col.id, { preprocessPrompt: v })}
                preprocessResult={rs.preprocessResult}
                isPreprocessing={rs.isPreprocessing}
                prompt={col.prompt}
                onPromptChange={(v) => updateColumn(col.id, { prompt: v })}
                response={rs.response}
                isStreaming={rs.isStreaming}
                inputTokens={rs.inputTokens}
                outputTokens={rs.outputTokens}
                cost={cost}
                disabled={isRunning}
                autoCollapse={autoCollapse}
                onRemove={columns.length > 1 ? () => removeColumn(col.id) : undefined}
              />
            );
          })}
        </Box>

        {/* ── AI EVALUATION ── */}
        <Collapse in={evalEnabled && (!!evalResponse || streamingEval)}>
          <Box mt={22}>
            <Divider
              label={
                <Box style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <IconBrain size={13} color="#9775fa" />
                  <Text size="xs" fw={600} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9775fa' }}>
                    AI Evaluation
                  </Text>
                  {streamingEval && <Badge size="xs" variant="dot" color="violet">analyzing</Badge>}
                </Box>
              }
              labelPosition="center"
              style={{ borderColor: 'rgba(121,80,242,0.18)' }}
              mb={14}
            />
            <Paper style={{ background: 'rgba(121,80,242,0.035)', border: '1px solid rgba(121,80,242,0.14)', borderRadius: 10, padding: '20px 22px' }}>
              {evalResponse
                ? <MarkdownOutput content={evalResponse} />
                : <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>Evaluation in progress…</Text>
              }
              {streamingEval && <Box component="span" style={{ display: 'inline-block', width: 2, height: '1em', background: '#9775fa', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 0.8s step-end infinite' }} />}
            </Paper>
          </Box>
        </Collapse>

        {/* Footer */}
        <Box style={{ textAlign: 'center', marginTop: 48, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Text size="xs" c="dimmed">
            {persist
              ? 'Fields saved in session storage — cleared when this tab closes'
              : 'API key never stored — all calls go directly to OpenAI from your browser'}
          </Text>
        </Box>
      </Box>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </Box>
  );
}
