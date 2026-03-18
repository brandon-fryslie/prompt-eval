import {
  Box,
  Textarea,
  Text,
  Paper,
  Loader,
  Badge,
  ActionIcon,
  Tooltip,
  Collapse,
  Switch,
} from '@mantine/core';
import {
  IconCopy,
  IconCheck,
  IconChevronRight,
  IconWand,
  IconMessageCircle,
  IconCode,
} from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { MarkdownOutput } from './MarkdownOutput';

interface Props {
  label: string;
  color: string;
  // Preprocessing
  preprocessEnabled: boolean;
  onPreprocessEnabledChange: (v: boolean) => void;
  preprocessPrompt: string;
  onPreprocessPromptChange: (v: string) => void;
  onPreprocessPromptBlur?: () => void;
  preprocessResult: string;
  isPreprocessing: boolean;
  // Main prompt
  prompt: string;
  onPromptChange: (v: string) => void;
  onPromptBlur?: () => void;
  // Output
  response: string;
  isStreaming: boolean;
  disabled: boolean;
  // Collapse control
  autoCollapse: boolean;
}

function tok(text: string): number {
  return Math.ceil(text.length / 4);
}


function SectionHeader({
  icon, label, open, onToggle, accent, badge,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  accent?: string;
  badge?: React.ReactNode;
}) {
  return (
    <Box
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', padding: '5px 0', userSelect: 'none' }}
    >
      <IconChevronRight
        size={11}
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease', color: accent ?? '#5c5f66', flexShrink: 0 }}
      />
      <Box style={{ color: accent ?? '#5c5f66', display: 'flex', alignItems: 'center' }}>{icon}</Box>
      <Text size="xs" style={{ letterSpacing: '0.07em', textTransform: 'uppercase', color: accent ?? '#5c5f66', fontWeight: 600 }}>
        {label}
      </Text>
      {badge}
    </Box>
  );
}

export function PromptPanel({
  label, color,
  preprocessEnabled, onPreprocessEnabledChange,
  preprocessPrompt, onPreprocessPromptChange, onPreprocessPromptBlur,
  preprocessResult, isPreprocessing,
  prompt, onPromptChange, onPromptBlur,
  response, isStreaming,
  disabled, autoCollapse,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [preprocessOpen, setPreprocessOpen] = useState(true);
  const [promptOpen, setPromptOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);
  const [generatedPromptOpen, setGeneratedPromptOpen] = useState(false);

  useEffect(() => {
    if (autoCollapse) {
      setPromptOpen(false);
      if (preprocessEnabled) setPreprocessOpen(false);
    }
  }, [autoCollapse, preprocessEnabled]);

  useEffect(() => {
    if (response || isStreaming) setOutputOpen(true);
  }, [response, isStreaming]);

  useEffect(() => {
    if (preprocessResult && !isPreprocessing) setGeneratedPromptOpen(true);
  }, [preprocessResult, isPreprocessing]);

  const handleCopy = () => {
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isViolet = color === '#7950f2';
  const borderRgb = isViolet ? '121,80,242' : '34,139,230';
  const loaderColor = isViolet ? 'violet' : 'blue';

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minWidth: 0 }}>

      {/* ── Panel title — always visible, shows live status when collapsed ── */}
      <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Box style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 7px ${color}`, flexShrink: 0 }} />
        <Text fw={700} size="xs" style={{ letterSpacing: '0.1em', textTransform: 'uppercase', color: '#909296' }}>
          {label}
        </Text>

        {/* Status indicator — visible even when sections are collapsed */}
        {isPreprocessing && (
          <Box style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
            <Loader size={10} color="violet" />
            <Text size="xs" style={{ color: '#9775fa' }}>preprocessing…</Text>
          </Box>
        )}
        {!isPreprocessing && isStreaming && (
          <Box style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
            <Loader size={10} color={loaderColor} />
            <Text size="xs" style={{ color: color }}>generating…</Text>
          </Box>
        )}
      </Box>

      <Paper
        style={{
          background: 'rgba(255,255,255,0.025)',
          border: `1px solid rgba(${borderRgb},0.18)`,
          borderRadius: 10,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── PREPROCESSING SECTION ── */}
        <Box style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '10px 14px 0' }}>
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionHeader
              icon={<IconWand size={11} />}
              label="Preprocessing"
              open={preprocessOpen && preprocessEnabled}
              onToggle={() => preprocessEnabled && setPreprocessOpen((v) => !v)}
              accent={preprocessEnabled ? '#9775fa' : '#5c5f66'}
              badge={
                isPreprocessing
                  ? <Badge size="xs" variant="dot" color="violet" ml={4}>running</Badge>
                  : undefined
              }
            />
            <Box style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {preprocessEnabled && tok(preprocessPrompt) > 0 && (
                <Text size="xs" c="dimmed">
                  ~{tok(isPreprocessing || preprocessResult ? preprocessResult : preprocessPrompt).toLocaleString()} tokens{isPreprocessing ? '…' : ''}
                </Text>
              )}
            <Switch
              size="xs"
              checked={preprocessEnabled}
              onChange={(e) => {
                onPreprocessEnabledChange(e.currentTarget.checked);
                if (e.currentTarget.checked) setPreprocessOpen(true);
              }}
              color="violet"
              styles={{ track: { background: preprocessEnabled ? undefined : 'rgba(255,255,255,0.1)', border: 'none' } }}
            />
            </Box>
          </Box>

          <Collapse in={preprocessEnabled && preprocessOpen}>
            <Box pb={12} pt={8}>
              <Textarea
                value={preprocessPrompt}
                onChange={(e) => onPreprocessPromptChange(e.currentTarget.value)}
                onBlur={onPreprocessPromptBlur}
                placeholder="Enter preprocessing instructions… the user prompt will be appended and the result used as the actual prompt."
                minRows={3}
                maxRows={8}
                autosize
                disabled={disabled}
                styles={{
                  input: {
                    background: 'rgba(121,80,242,0.05)',
                    border: '1px solid rgba(121,80,242,0.2)',
                    color: '#C1C2C5',
                    fontSize: '13px',
                    lineHeight: '1.6',
                  },
                }}
              />

              {/* Generated prompt preview */}
              {preprocessResult && (
                <Box mt={8}>
                  <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <SectionHeader
                      icon={<IconCode size={11} />}
                      label="Generated Prompt"
                      open={generatedPromptOpen}
                      onToggle={() => setGeneratedPromptOpen((v) => !v)}
                      accent="#6c6cff"
                    />
                    {generatedPromptOpen && tok(preprocessResult) > 0 && (
                      <Text size="xs" c="dimmed">~{tok(preprocessResult).toLocaleString()} tokens</Text>
                    )}
                  </Box>
                  <Collapse in={generatedPromptOpen}>
                    <Box
                      mt={6} p={10}
                      style={{
                        background: 'rgba(108,108,255,0.06)',
                        border: '1px solid rgba(108,108,255,0.15)',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#A6A7AB',
                        fontFamily: '"JetBrains Mono", monospace',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {preprocessResult}
                      {isPreprocessing && (
                        <Box component="span" style={{ display: 'inline-block', width: 2, height: '1em', background: '#9775fa', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 0.8s step-end infinite' }} />
                      )}
                    </Box>
                  </Collapse>
                </Box>
              )}
            </Box>
          </Collapse>
        </Box>

        {/* ── PROMPT SECTION ── */}
        <Box style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '10px 14px 0' }}>
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionHeader
              icon={<IconMessageCircle size={11} />}
              label="Prompt"
              open={promptOpen}
              onToggle={() => setPromptOpen((v) => !v)}
              accent={color}
            />
            {tok(prompt) > 0 && !disabled && (
              <Text size="xs" c="dimmed">~{tok(prompt).toLocaleString()} tokens</Text>
            )}
          </Box>
          <Collapse in={promptOpen}>
            <Box pb={12} pt={8}>
              <Textarea
                value={prompt}
                onChange={(e) => onPromptChange(e.currentTarget.value)}
                onBlur={onPromptBlur}
                placeholder={`Enter ${label.toLowerCase()}…`}
                minRows={4}
                maxRows={14}
                autosize
                disabled={disabled}
                styles={{
                  input: {
                    background: `rgba(${borderRgb},0.04)`,
                    border: `1px solid rgba(${borderRgb},0.2)`,
                    color: '#C1C2C5',
                    fontSize: '13px',
                    lineHeight: '1.6',
                  },
                }}
              />
            </Box>
          </Collapse>
        </Box>

        {/* ── OUTPUT SECTION ── */}
        <Box style={{ padding: '10px 14px 14px' }}>
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionHeader
              icon={
                isStreaming
                  ? <Loader size={10} color={loaderColor} />
                  : (
                    <Box style={{ width: 10, height: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box style={{ width: 6, height: 6, borderRadius: '50%', background: response ? color : 'rgba(255,255,255,0.15)', boxShadow: response ? `0 0 4px ${color}` : 'none' }} />
                    </Box>
                  )
              }
              label="Output"
              open={outputOpen}
              onToggle={() => setOutputOpen((v) => !v)}
              accent={response || isStreaming ? color : '#5c5f66'}
              badge={isStreaming ? <Badge size="xs" variant="dot" color="violet" ml={4}>streaming</Badge> : undefined}
            />
            <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {response && (
                <Text size="xs" c="dimmed">
                  ~{tok(response).toLocaleString()} tokens{isStreaming ? '…' : ''}
                </Text>
              )}
              {response && !isStreaming && (
                <Tooltip label={copied ? 'Copied!' : 'Copy'} position="left">
                  <ActionIcon size="xs" variant="subtle" color={copied ? 'green' : 'gray'} onClick={handleCopy}>
                    {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </Box>
          </Box>

          <Collapse in={outputOpen}>
            <Box mt={10} style={{ minHeight: 60 }}>
              {!response && !isStreaming && (
                <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>Response will appear here…</Text>
              )}
              {isStreaming && !response && (
                <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader size="xs" color={loaderColor} />
                  <Text size="sm" c="dimmed">{isPreprocessing ? 'Preprocessing…' : 'Generating…'}</Text>
                </Box>
              )}
              {response && (
                <Box>
                  <MarkdownOutput content={response} />
                  {isStreaming && (
                    <Box component="span" style={{ display: 'inline-block', width: 2, height: '1em', background: color, marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 0.8s step-end infinite' }} />
                  )}
                </Box>
              )}
            </Box>
          </Collapse>
        </Box>
      </Paper>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </Box>
  );
}
