import {
  Box,
  TextInput,
  Select,
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
  SegmentedControl,
  Textarea,
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
  IconLayoutColumns,
  IconEdit,
  IconMessageCircle,
  IconChevronRight,
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

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'models' | 'prompts';

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
const MODEL_CANDIDATES = ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o4-mini', 'o3', 'gpt-4o'];

function makeColumn(model = DEFAULT_MODEL): ColumnConfig {
  return {
    id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    model, prompt: '', preprocessEnabled: false, preprocessPrompt: '',
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────

const KEYS = {
  persist:       'pe-persist',
  apiKey:        'pe-api-key',
  columns:       'pe-columns-v2',
  eval:          'pe-eval-enabled',
  mode:          'pe-mode',
  sharedPrompt:  'pe-shared-prompt',
  sharedModel:   'pe-shared-model',
} as const;

const persistedOnLoad = sessionStorage.getItem(KEYS.persist) === 'true';
const ss = (key: string, fallback: string) =>
  persistedOnLoad ? (sessionStorage.getItem(key) ?? fallback) : fallback;

const defaultColumns: ColumnConfig[] = [makeColumn('gpt-4.1'), makeColumn('gpt-4.1-mini')];

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

  const [mode, setMode] = useState<Mode>(() => ss(KEYS.mode, 'prompts') as Mode);
  const [sharedPrompt, setSharedPrompt] = useState(() => ss(KEYS.sharedPrompt, ''));
  const [sharedModel, setSharedModel] = useState(() => ss(KEYS.sharedModel, DEFAULT_MODEL));
  const [sharedPromptOpen, setSharedPromptOpen] = useState(true);

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

  useEffect(() => {
    fetchModels()
      .then(({ groups, pricingMap }) => { setModels(groups); setPricingMap(pricingMap); })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, []);

  // ── Persistence ────────────────────────────────────────────────────────────

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
      sessionStorage.setItem(KEYS.apiKey,       apiKey);
      sessionStorage.setItem(KEYS.columns,      JSON.stringify(columns));
      sessionStorage.setItem(KEYS.eval,         String(evalEnabled));
      sessionStorage.setItem(KEYS.mode,         mode);
      sessionStorage.setItem(KEYS.sharedPrompt, sharedPrompt);
      sessionStorage.setItem(KEYS.sharedModel,  sharedModel);
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
    let newModel = DEFAULT_MODEL;
    if (mode === 'models') {
      const used = new Set(columns.map((c) => c.model));
      newModel = MODEL_CANDIDATES.find((m) => !used.has(m)) ?? DEFAULT_MODEL;
    }
    const col = makeColumn(newModel);
    setColumns((prev) => { const next = [...prev, col]; saveColumns(next); return next; });
  };

  const removeColumn = (id: string) => {
    setColumns((prev) => { const next = prev.filter((c) => c.id !== id); saveColumns(next); return next; });
    setRunStates((prev) => { const { [id]: _, ...rest } = prev; return rest; });
  };

  // ── Duplicate model detection ──────────────────────────────────────────────

  const modelCounts = columns.reduce<Record<string, number>>((acc, c) => {
    acc[c.model] = (acc[c.model] ?? 0) + 1;
    return acc;
  }, {});
  const hasDuplicateModels = mode === 'models' && Object.values(modelCounts).some((n) => n > 1);

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
    async (col: ColumnConfig, effectiveModel: string, effectivePromptText: string, client: ReturnType<typeof createClient>): Promise<[string, RunResult]> => {
      let promptToRun = effectivePromptText;

      if (col.preprocessEnabled && col.preprocessPrompt.trim()) {
        const combined = `${col.preprocessPrompt.trim()}\n\n${effectivePromptText}`;
        setField(col.id, 'isPreprocessing', true);
        try {
          const result = await runPrompt(client, effectiveModel, combined, (d) => appendField(col.id, 'preprocessResult', d));
          promptToRun = result.text;
        } finally {
          setField(col.id, 'isPreprocessing', false);
        }
      }

      setField(col.id, 'isStreaming', true);
      try {
        const result = await runPrompt(client, effectiveModel, promptToRun, (d) => appendField(col.id, 'response', d));
        setRunStates((prev) => ({
          ...prev,
          [col.id]: { ...(prev[col.id] ?? emptyRunState()), isStreaming: false, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        }));
        return [promptToRun, result];
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
    if (mode === 'models' && !sharedPrompt.trim()) {
      notifications.show({ title: 'No Prompt', message: 'Enter a shared prompt', color: 'orange' });
      return;
    }
    if (mode === 'prompts' && !columns.some((c) => c.prompt.trim())) {
      notifications.show({ title: 'No Prompts', message: 'Enter at least one prompt', color: 'orange' });
      return;
    }
    if (hasDuplicateModels) {
      notifications.show({ title: 'Duplicate Models', message: 'Each column must use a different model', color: 'orange' });
      return;
    }

    setError(''); setIsRunning(true); setAutoCollapse(true);
    setRunStates({});
    setEvalResponse('');

    const client = createClient(apiKey.trim());

    const active = columns.filter((c) => {
      if (mode === 'models') return true; // shared prompt — all columns run
      return c.prompt.trim();
    });

    try {
      const results = await Promise.all(
        active.map((col) => {
          const effectiveModel = mode === 'prompts' ? sharedModel : col.model;
          const effectivePromptText = mode === 'models' ? sharedPrompt : col.prompt;
          return runColumn(col, effectiveModel, effectivePromptText, client);
        })
      );

      if (evalEnabled && results.length >= 2) {
        const entries = results
          .map(([effPrompt, result], i) => ({
            label: `Column ${COLUMN_LABELS[columns.findIndex((c) => c.id === active[i].id)] ?? i + 1}`,
            prompt: effPrompt,
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
  }, [apiKey, mode, sharedPrompt, sharedModel, columns, evalEnabled, hasDuplicateModels, runColumn]);

  const handleClear = () => {
    setRunStates({});
    setEvalResponse('');
    setError('');
  };

  const hasAnyResponse = columns.some((c) => runStates[c.id]?.response);

  const canRun = !!apiKey.trim() && !hasDuplicateModels && (
    mode === 'models' ? !!sharedPrompt.trim() : columns.some((c) => c.prompt.trim())
  );

  // Pre-run input cost estimate per column
  const getEstimatedInputCost = (col: ColumnConfig): number | null => {
    const promptText = mode === 'models' ? sharedPrompt : col.prompt;
    const modelId = mode === 'prompts' ? sharedModel : col.model;
    if (!promptText.trim()) return null;
    return calcCost(modelId, Math.ceil(promptText.length / 4), 0, pricingMap);
  };

  // Shared prompt estimated cost (compare-models mode — same for all, just to show in the block)
  const sharedPromptTokens = Math.ceil(sharedPrompt.length / 4);

  return (
    <Box style={{ position: 'relative', minHeight: '100vh' }}>
      <GeometricCanvas />

      <Box style={{ position: 'relative', zIndex: 1, maxWidth: columns.length > 2 ? '100%' : 1400, margin: '0 auto', padding: '20px 28px 64px' }}>

        {/* ── HEADER ── */}
        <Paper style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', marginBottom: 18, backdropFilter: 'blur(16px)' }}>

          {/* Row 1: Logo · API Key · Actions */}
          <Box style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Box style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
              <Box style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #7950f2, #9775fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(121,80,242,0.45)' }}>
                <IconSparkles size={15} color="white" />
              </Box>
              <Text style={{ fontSize: 16, fontWeight: 700, background: 'linear-gradient(135deg, #9775fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
                PromptEval
              </Text>
            </Box>

            <Box style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

            <Box style={{ flex: 1, minWidth: 240 }}>
              <TextInput
                placeholder="OpenAI API key  sk-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.currentTarget.value)}
                onBlur={(e) => save(KEYS.apiKey, e.currentTarget.value)}
                type={showKey ? 'text' : 'password'}
                size="sm"
                leftSection={<IconKey size={14} color="#5c5f66" />}
                rightSection={
                  <Tooltip label={showKey ? 'Hide key' : 'Show key'} position="top">
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setShowKey((v) => !v)}>
                      {showKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                    </ActionIcon>
                  </Tooltip>
                }
                styles={{ input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#C1C2C5' } }}
              />
            </Box>

            <Group gap={8} style={{ marginLeft: 'auto', flexShrink: 0 }}>
              {hasAnyResponse && (
                <Tooltip label="Clear results">
                  <ActionIcon variant="light" color="gray" size="md" onClick={handleClear} disabled={isRunning}>
                    <IconTrash size={15} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Button
                leftSection={<IconBolt size={15} />}
                onClick={handleRun}
                loading={isRunning}
                size="sm"
                disabled={!canRun}
                style={{ background: isRunning ? undefined : 'linear-gradient(135deg, #7950f2, #9775fa)', border: 'none', fontWeight: 600, letterSpacing: '0.02em', boxShadow: isRunning ? undefined : '0 0 18px rgba(121,80,242,0.35)', paddingLeft: 18, paddingRight: 18 }}
              >
                {isRunning ? 'Running…' : 'Run'}
              </Button>
            </Group>
          </Box>

          <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

          {/* Row 2: Mode · Add Column · Model (prompts mode) · AI Eval · Save */}
          <Box style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>

            {/* Mode toggle */}
            <SegmentedControl
              value={mode}
              onChange={(v) => { setMode(v as Mode); save(KEYS.mode, v); }}
              data={[
                { value: 'prompts', label: <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconEdit size={13} /><span>Compare Prompts</span></Box> },
                { value: 'models',  label: <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconLayoutColumns size={13} /><span>Compare Models</span></Box> },
              ]}
              size="xs"
              color="violet"
              styles={{
                root: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8 },
                label: { fontSize: 12, fontWeight: 500, color: '#909296' },
              }}
            />

            {/* Add column */}
            <Tooltip label={columns.length >= 6 ? 'Max 6 columns' : 'Add a column'} position="top">
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                leftSection={<IconPlus size={13} />}
                onClick={addColumn}
                disabled={isRunning || columns.length >= 6}
                style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7 }}
              >
                Column
              </Button>
            </Tooltip>

            <Box style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

            {/* Global model selector (compare-prompts mode) */}
            {mode === 'prompts' && (
              <>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>Model</Text>
                <Box style={{ width: 185 }}>
                  <Select
                    value={sharedModel}
                    onChange={(v) => { if (v) { setSharedModel(v); save(KEYS.sharedModel, v); } }}
                    data={models}
                    placeholder={modelsLoading ? 'Loading…' : 'Select model'}
                    searchable
                    size="xs"
                    styles={{
                      input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#C1C2C5', fontSize: 13 },
                      dropdown: { background: '#1A1B1E', border: '1px solid rgba(255,255,255,0.1)' },
                      option: { color: '#C1C2C5', fontSize: 13 },
                    }}
                  />
                </Box>
                <Box style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
              </>
            )}

            {/* AI Eval */}
            <Switch
              label={
                <Box style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <IconBrain size={13} color={evalEnabled ? '#9775fa' : '#5c5f66'} />
                  <Text size="xs" style={{ color: evalEnabled ? '#9775fa' : '#5c5f66' }}>AI Eval</Text>
                </Box>
              }
              checked={evalEnabled}
              onChange={(e) => { setEvalEnabled(e.currentTarget.checked); save(KEYS.eval, String(e.currentTarget.checked)); }}
              color="violet"
              size="xs"
              styles={{ track: { background: evalEnabled ? undefined : 'rgba(255,255,255,0.1)', border: 'none' } }}
            />

            {/* Save session */}
            <Tooltip label="Saved in session storage — cleared when the tab closes" position="bottom" multiline w={260}>
              <Box>
                <Switch
                  label={
                    <Box style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <IconDeviceFloppy size={13} color={persist ? '#20c997' : '#5c5f66'} />
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

            {/* Duplicate model warning */}
            {hasDuplicateModels && (
              <Badge color="orange" variant="light" size="sm" leftSection={<IconAlertCircle size={11} />}>
                Duplicate models
              </Badge>
            )}
          </Box>
        </Paper>

        {/* Error */}
        {error && (
          <Alert icon={<IconAlertCircle size={14} />} color="red" variant="light" mb={16} style={{ background: 'rgba(250,82,82,0.07)', border: '1px solid rgba(250,82,82,0.2)' }}>
            {error}
          </Alert>
        )}

        {/* ── SHARED PROMPT (compare-models mode) ── */}
        {mode === 'models' && (
          <Paper style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(121,80,242,0.2)', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
            <Box style={{ padding: '12px 16px 0' }}>
              <Box
                onClick={() => setSharedPromptOpen((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', paddingBottom: sharedPromptOpen ? 10 : 12 }}
              >
                <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconChevronRight size={12} style={{ transform: sharedPromptOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s', color: '#9775fa' }} />
                  <IconMessageCircle size={13} color="#9775fa" />
                  <Text size="xs" fw={700} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9775fa' }}>
                    Shared Prompt
                  </Text>
                  <Text size="xs" c="dimmed" style={{ marginLeft: 4 }}>
                    — same prompt sent to every model
                  </Text>
                </Box>
                <Text size="xs" c="dimmed">
                  {sharedPromptTokens > 0 ? `~${sharedPromptTokens.toLocaleString()} tokens` : ''}
                </Text>
              </Box>
            </Box>
            <Collapse in={sharedPromptOpen}>
              <Box style={{ padding: '0 16px 16px' }}>
                <Textarea
                  value={sharedPrompt}
                  onChange={(e) => { setSharedPrompt(e.currentTarget.value); save(KEYS.sharedPrompt, e.currentTarget.value); }}
                  placeholder="Enter the prompt to compare across all models…"
                  minRows={4}
                  maxRows={16}
                  autosize
                  disabled={isRunning}
                  styles={{
                    input: { background: 'rgba(121,80,242,0.05)', border: '1px solid rgba(121,80,242,0.18)', color: '#C1C2C5', fontSize: '13px', lineHeight: '1.65' },
                  }}
                />
              </Box>
            </Collapse>
          </Paper>
        )}

        {/* ── COLUMNS ── */}
        <Box style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(300px, 1fr))`, gap: 18, overflowX: 'auto' }}>
          {columns.map((col, i) => {
            const rs = runStates[col.id] ?? emptyRunState();
            const effectiveModel = mode === 'prompts' ? sharedModel : col.model;
            const postRunCost = rs.inputTokens || rs.outputTokens
              ? calcCost(effectiveModel, rs.inputTokens, rs.outputTokens, pricingMap)
              : null;
            const estimatedInputCost = !rs.response && !rs.isStreaming
              ? getEstimatedInputCost(col)
              : null;
            const isDup = mode === 'models' && (modelCounts[col.model] ?? 0) > 1;

            return (
              <PromptPanel
                key={col.id}
                label={`${mode === 'models' ? 'Model' : 'Prompt'} ${COLUMN_LABELS[i] ?? i + 1}`}
                color={COLUMN_COLORS[i % COLUMN_COLORS.length]}
                model={col.model}
                onModelChange={(m) => updateColumn(col.id, { model: m })}
                models={models}
                modelsLoading={modelsLoading}
                hideModelSelector={mode === 'prompts'}
                isDuplicateModel={isDup}
                preprocessEnabled={col.preprocessEnabled}
                onPreprocessEnabledChange={(v) => updateColumn(col.id, { preprocessEnabled: v })}
                preprocessPrompt={col.preprocessPrompt}
                onPreprocessPromptChange={(v) => updateColumn(col.id, { preprocessPrompt: v })}
                preprocessResult={rs.preprocessResult}
                isPreprocessing={rs.isPreprocessing}
                prompt={col.prompt}
                onPromptChange={(v) => updateColumn(col.id, { prompt: v })}
                hidePromptSection={mode === 'models'}
                response={rs.response}
                isStreaming={rs.isStreaming}
                inputTokens={rs.inputTokens}
                outputTokens={rs.outputTokens}
                cost={postRunCost}
                estimatedInputCost={estimatedInputCost}
                disabled={isRunning}
                autoCollapse={autoCollapse}
                onRemove={columns.length > 1 ? () => removeColumn(col.id) : undefined}
              />
            );
          })}
        </Box>

        {/* ── AI EVALUATION ── */}
        <Collapse in={evalEnabled && (!!evalResponse || streamingEval)}>
          <Box mt={24}>
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
            <Paper style={{ background: 'rgba(121,80,242,0.035)', border: '1px solid rgba(121,80,242,0.14)', borderRadius: 10, padding: '20px 24px' }}>
              {evalResponse
                ? <MarkdownOutput content={evalResponse} />
                : <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>Evaluation in progress…</Text>
              }
              {streamingEval && <Box component="span" style={{ display: 'inline-block', width: 2, height: '1em', background: '#9775fa', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 0.8s step-end infinite' }} />}
            </Paper>
          </Box>
        </Collapse>

        {/* Footer */}
        <Box style={{ textAlign: 'center', marginTop: 52, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
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
