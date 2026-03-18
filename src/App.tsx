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
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useState, useCallback } from 'react';
import { GeometricCanvas } from './components/GeometricCanvas';
import { PromptPanel } from './components/PromptPanel';
import { MarkdownOutput } from './components/MarkdownOutput';
import { createClient, runPrompt, evaluateResponses, MODELS } from './openai';


interface PreprocessState {
  enabled: boolean;
  prompt: string;
}

// Keys used in sessionStorage
const KEYS = {
  persist:        'pe-persist',
  apiKey:         'pe-api-key',
  model:          'pe-model',
  promptA:        'pe-prompt-a',
  promptB:        'pe-prompt-b',
  preAEnabled:    'pe-pre-a-enabled',
  preAPrompt:     'pe-pre-a-prompt',
  preBEnabled:    'pe-pre-b-enabled',
  preBPrompt:     'pe-pre-b-prompt',
  evalEnabled:    'pe-eval-enabled',
} as const;

// Read persisted flag once at module evaluation so state initializers can use it
const persistedOnLoad = sessionStorage.getItem(KEYS.persist) === 'true';
const ss = (key: string, fallback: string) =>
  persistedOnLoad ? (sessionStorage.getItem(key) ?? fallback) : fallback;

export default function App() {
  const [persist, setPersist] = useState(persistedOnLoad);
  const [apiKey,  setApiKey]  = useState(() => ss(KEYS.apiKey,  ''));
  const [showKey, setShowKey] = useState(false);
  const [model,   setModel]   = useState(() => ss(KEYS.model, 'gpt-4.1'));

  const [promptA, setPromptA] = useState(() => ss(KEYS.promptA, ''));
  const [promptB, setPromptB] = useState(() => ss(KEYS.promptB, ''));
  const [preprocessA, setPreprocessA] = useState<PreprocessState>(() => ({
    enabled: ss(KEYS.preAEnabled, 'false') === 'true',
    prompt:  ss(KEYS.preAPrompt,  ''),
  }));
  const [preprocessB, setPreprocessB] = useState<PreprocessState>(() => ({
    enabled: ss(KEYS.preBEnabled, 'false') === 'true',
    prompt:  ss(KEYS.preBPrompt,  ''),
  }));
  const [evalEnabled, setEvalEnabled] = useState(() => ss(KEYS.evalEnabled, 'false') === 'true');

  // Run state
  const [responseA, setResponseA] = useState('');
  const [responseB, setResponseB] = useState('');
  const [preprocessResultA, setPreprocessResultA] = useState('');
  const [preprocessResultB, setPreprocessResultB] = useState('');
  const [streamingA,    setStreamingA]    = useState(false);
  const [streamingB,    setStreamingB]    = useState(false);
  const [preprocessingA, setPreprocessingA] = useState(false);
  const [preprocessingB, setPreprocessingB] = useState(false);
  const [evalResponse,  setEvalResponse]  = useState('');
  const [streamingEval, setStreamingEval] = useState(false);
  const [isRunning,  setIsRunning]  = useState(false);
  const [autoCollapse, setAutoCollapse] = useState(false);
  const [error, setError] = useState('');

  // Save a single key — only when persist is on
  const save = useCallback((key: string, value: string) => {
    if (persist) sessionStorage.setItem(key, value);
  }, [persist]);

  // Toggle persistence: when turning on, flush current state; when off, clear all keys
  const handlePersistToggle = (on: boolean) => {
    setPersist(on);
    sessionStorage.setItem(KEYS.persist, String(on));
    if (on) {
      sessionStorage.setItem(KEYS.apiKey,      apiKey);
      sessionStorage.setItem(KEYS.model,       model);
      sessionStorage.setItem(KEYS.promptA,     promptA);
      sessionStorage.setItem(KEYS.promptB,     promptB);
      sessionStorage.setItem(KEYS.preAEnabled, String(preprocessA.enabled));
      sessionStorage.setItem(KEYS.preAPrompt,  preprocessA.prompt);
      sessionStorage.setItem(KEYS.preBEnabled, String(preprocessB.enabled));
      sessionStorage.setItem(KEYS.preBPrompt,  preprocessB.prompt);
      sessionStorage.setItem(KEYS.evalEnabled, String(evalEnabled));
    } else {
      Object.values(KEYS).forEach((k) => k !== KEYS.persist && sessionStorage.removeItem(k));
    }
  };

  // ── Run logic ──
  const runPanel = useCallback(
    async (
      side: 'A' | 'B',
      prompt: string,
      preprocess: PreprocessState,
      client: ReturnType<typeof createClient>
    ): Promise<[string, string]> => {
      let effectivePrompt = prompt;

      if (preprocess.enabled && preprocess.prompt.trim()) {
        const combined = `${preprocess.prompt.trim()}\n\n${prompt}`;
        if (side === 'A') setPreprocessingA(true); else setPreprocessingB(true);
        try {
          effectivePrompt = await runPrompt(client, model, combined, (delta) => {
            if (side === 'A') setPreprocessResultA((p) => p + delta);
            else              setPreprocessResultB((p) => p + delta);
          });
        } finally {
          if (side === 'A') setPreprocessingA(false); else setPreprocessingB(false);
        }
      }

      if (side === 'A') setStreamingA(true); else setStreamingB(true);
      try {
        const response = await runPrompt(client, model, effectivePrompt, (delta) => {
          if (side === 'A') setResponseA((p) => p + delta);
          else              setResponseB((p) => p + delta);
        });
        return [effectivePrompt, response];
      } finally {
        if (side === 'A') setStreamingA(false); else setStreamingB(false);
      }
    },
    [model]
  );

  const handleRun = useCallback(async () => {
    if (!apiKey.trim()) {
      notifications.show({ title: 'API Key Required', message: 'Please enter your OpenAI API key', color: 'red', icon: <IconAlertCircle size={16} /> });
      return;
    }
    if (!promptA.trim() && !promptB.trim()) {
      notifications.show({ title: 'No Prompts', message: 'Enter at least one prompt', color: 'orange' });
      return;
    }

    setError(''); setIsRunning(true); setAutoCollapse(true);
    setResponseA(''); setResponseB('');
    setPreprocessResultA(''); setPreprocessResultB('');
    setEvalResponse('');

    const client = createClient(apiKey.trim());
    try {
      const taskA = promptA.trim() ? runPanel('A', promptA, preprocessA, client) : Promise.resolve(['', ''] as [string, string]);
      const taskB = promptB.trim() ? runPanel('B', promptB, preprocessB, client) : Promise.resolve(['', ''] as [string, string]);
      const [[effA, resA], [effB, resB]] = await Promise.all([taskA, taskB]);

      if (evalEnabled && resA && resB) {
        setStreamingEval(true);
        await evaluateResponses(client, model, effA || promptA, resA, effB || promptB, resB, (delta) => {
          setEvalResponse((p) => p + delta);
        }).finally(() => setStreamingEval(false));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      notifications.show({ title: 'Error', message: msg, color: 'red', icon: <IconAlertCircle size={16} /> });
    } finally {
      setIsRunning(false); setAutoCollapse(false);
    }
  }, [apiKey, model, promptA, promptB, preprocessA, preprocessB, evalEnabled, runPanel]);

  const handleClear = () => {
    setResponseA(''); setResponseB('');
    setPreprocessResultA(''); setPreprocessResultB('');
    setEvalResponse(''); setError('');
  };

  return (
    <Box style={{ position: 'relative', minHeight: '100vh' }}>
      <GeometricCanvas />

      <Box style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto', padding: '16px 24px 64px' }}>

        {/* ── HEADER BAR ── */}
        <Paper
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12,
            padding: '12px 18px',
            marginBottom: 16,
            backdropFilter: 'blur(16px)',
          }}
        >
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
                styles={{
                  input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#C1C2C5', fontSize: 13 },
                }}
              />
            </Box>

            {/* Model */}
            <Box style={{ width: 165 }}>
              <Select
                value={model}
                onChange={(v) => { if (v) { setModel(v); save(KEYS.model, v); } }}
                data={MODELS}
                size="xs"
                styles={{
                  input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#C1C2C5', fontSize: 13 },
                  dropdown: { background: '#1A1B1E', border: '1px solid rgba(255,255,255,0.1)' },
                  option: { color: '#C1C2C5', fontSize: 13 },
                }}
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
              onChange={(e) => { setEvalEnabled(e.currentTarget.checked); save(KEYS.evalEnabled, String(e.currentTarget.checked)); }}
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
              {(responseA || responseB) && (
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
                disabled={!apiKey.trim() || (!promptA.trim() && !promptB.trim())}
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

        {/* ── PANELS ── */}
        <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <PromptPanel
            label="Prompt A"
            color="#7950f2"
            preprocessEnabled={preprocessA.enabled}
            onPreprocessEnabledChange={(v) => { setPreprocessA((s) => ({ ...s, enabled: v })); save(KEYS.preAEnabled, String(v)); }}
            preprocessPrompt={preprocessA.prompt}
            onPreprocessPromptChange={(v) => setPreprocessA((s) => ({ ...s, prompt: v }))}
            onPreprocessPromptBlur={() => save(KEYS.preAPrompt, preprocessA.prompt)}
            preprocessResult={preprocessResultA}
            isPreprocessing={preprocessingA}
            prompt={promptA}
            onPromptChange={setPromptA}
            onPromptBlur={() => save(KEYS.promptA, promptA)}
            response={responseA}
            isStreaming={streamingA}
            disabled={isRunning}
            autoCollapse={autoCollapse}
          />
          <PromptPanel
            label="Prompt B"
            color="#228be6"
            preprocessEnabled={preprocessB.enabled}
            onPreprocessEnabledChange={(v) => { setPreprocessB((s) => ({ ...s, enabled: v })); save(KEYS.preBEnabled, String(v)); }}
            preprocessPrompt={preprocessB.prompt}
            onPreprocessPromptChange={(v) => setPreprocessB((s) => ({ ...s, prompt: v }))}
            onPreprocessPromptBlur={() => save(KEYS.preBPrompt, preprocessB.prompt)}
            preprocessResult={preprocessResultB}
            isPreprocessing={preprocessingB}
            prompt={promptB}
            onPromptChange={setPromptB}
            onPromptBlur={() => save(KEYS.promptB, promptB)}
            response={responseB}
            isStreaming={streamingB}
            disabled={isRunning}
            autoCollapse={autoCollapse}
          />
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
              {streamingEval && (
                <Box component="span" style={{ display: 'inline-block', width: 2, height: '1em', background: '#9775fa', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 0.8s step-end infinite' }} />
              )}
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
