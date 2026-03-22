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
  Select,
} from '@mantine/core';
import {
  IconCopy,
  IconCheck,
  IconChevronRight,
  IconWand,
  IconMessageCircle,
  IconCode,
  IconX,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { useState, useEffect, useRef } from 'react';
import { MarkdownOutput } from './MarkdownOutput';
import { formatCost, type ModelGroup } from '../openai';

interface Props {
  label: string;
  color: string;
  // Model
  model: string;
  onModelChange: (model: string) => void;
  models: ModelGroup[];
  modelsLoading: boolean;
  hideModelSelector?: boolean;
  isDuplicateModel?: boolean;
  // Provider
  provider: string;
  onProviderChange: (provider: string) => void;
  providers: Array<{ value: string; label: string }>;
  hideProviderSelector?: boolean;
  // Preprocessing
  preprocessEnabled: boolean;
  onPreprocessEnabledChange: (v: boolean) => void;
  preprocessPrompt: string;
  onPreprocessPromptChange: (v: string) => void;
  preprocessResult: string;
  isPreprocessing: boolean;
  // Main prompt
  prompt: string;
  onPromptChange: (v: string) => void;
  hidePromptSection?: boolean;
  // Output
  response: string;
  isStreaming: boolean;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  estimatedInputCost: number | null;
  disabled: boolean;
  autoCollapse: boolean;
  // Optional remove
  onRemove?: () => void;
  autoFocusPrompt?: boolean;
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
  model, onModelChange, models, modelsLoading, hideModelSelector, isDuplicateModel,
  provider, onProviderChange, providers, hideProviderSelector,
  preprocessEnabled, onPreprocessEnabledChange,
  preprocessPrompt, onPreprocessPromptChange,
  preprocessResult, isPreprocessing,
  prompt, onPromptChange, hidePromptSection,
  response, isStreaming, inputTokens, outputTokens, cost, estimatedInputCost,
  disabled, autoCollapse, onRemove, autoFocusPrompt,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [preprocessOpen, setPreprocessOpen] = useState(true);
  const [promptOpen, setPromptOpen] = useState(true);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [outputOpen, setOutputOpen] = useState(true);
  const [generatedPromptOpen, setGeneratedPromptOpen] = useState(false);
  const [outputHovered, setOutputHovered] = useState(false);

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

  useEffect(() => {
    if (autoFocusPrompt) {
      setPromptOpen(true);
      setTimeout(() => promptRef.current?.focus(), 50);
    }
  }, [autoFocusPrompt]);

  const handleCopy = () => {
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const borderRgb =
    color === '#7950f2' ? '121,80,242' :
    color === '#228be6' ? '34,139,230' :
    color === '#20c997' ? '32,201,151' :
    color === '#f59f00' ? '245,159,0'  :
    color === '#fa5252' ? '250,82,82'  :
                          '230,73,128';

  const loaderColor =
    color === '#7950f2' ? 'violet' :
    color === '#228be6' ? 'blue'   :
    color === '#20c997' ? 'teal'   :
    color === '#f59f00' ? 'yellow' :
    color === '#fa5252' ? 'red'    :
                          'pink';

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minWidth: 0 }}>

      {/* ── Panel title ── */}
      <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, minHeight: 28 }}>
        <Box style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 7px ${color}`, flexShrink: 0 }} />
        <Text fw={700} size="xs" style={{ letterSpacing: '0.1em', textTransform: 'uppercase', color: '#909296', flexShrink: 0 }}>
          {label}
        </Text>

        {/* Provider selector (compare-models mode) */}
        {!hideProviderSelector && providers.length > 0 && (
          <Box style={{ width: 130, flexShrink: 0 }}>
            <Select
              value={provider}
              onChange={(v) => v && onProviderChange(v)}
              data={providers}
              size="xs"
              disabled={disabled}
              styles={{
                input: {
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid rgba(${borderRgb},0.2)`,
                  color: '#C1C2C5', fontSize: 12, height: 26, minHeight: 26, paddingTop: 0, paddingBottom: 0,
                },
                dropdown: { background: '#1A1B1E', border: '1px solid rgba(255,255,255,0.1)' },
                option: { color: '#C1C2C5', fontSize: 12 },
              }}
            />
          </Box>
        )}

        {/* Model selector (compare-models mode) */}
        {!hideModelSelector && (
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Select
              value={model}
              onChange={(v) => v && onModelChange(v)}
              data={models.map((g) => ({ ...g, items: g.items.filter((m) => m.provider === provider) })).filter((g) => g.items.length > 0)}
              placeholder={modelsLoading ? 'Loading…' : 'Model'}
              searchable
              size="xs"
              disabled={disabled}
              styles={{
                input: {
                  background: isDuplicateModel ? 'rgba(255,140,0,0.08)' : 'rgba(255,255,255,0.04)',
                  border: isDuplicateModel ? '1px solid rgba(255,140,0,0.4)' : `1px solid rgba(${borderRgb},0.2)`,
                  color: '#C1C2C5', fontSize: 12, height: 26, minHeight: 26, paddingTop: 0, paddingBottom: 0,
                },
                dropdown: { background: '#1A1B1E', border: '1px solid rgba(255,255,255,0.1)' },
                option: { color: '#C1C2C5', fontSize: 12 },
              }}
            />
          </Box>
        )}

        {isDuplicateModel && (
          <Tooltip label="Duplicate model — each column must use a different model" position="top">
            <Box style={{ flexShrink: 0, color: '#f59f00', display: 'flex' }}>
              <IconAlertTriangle size={14} />
            </Box>
          </Tooltip>
        )}

        {/* Streaming status */}
        {isPreprocessing && (
          <Box style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Loader size={10} color="violet" />
            <Text size="xs" style={{ color: '#9775fa' }}>pre…</Text>
          </Box>
        )}
        {!isPreprocessing && isStreaming && (
          <Loader size={10} color={loaderColor} style={{ flexShrink: 0 }} />
        )}

        {/* Pre-run estimated input cost — shown before running */}
        {estimatedInputCost !== null && estimatedInputCost > 0 && !isStreaming && (
          <Tooltip label="Estimated input cost based on prompt length" position="top">
            <Text size="xs" style={{ color: 'rgba(100,160,255,0.55)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, cursor: 'default' }}>
              {formatCost(estimatedInputCost, '~')} in
            </Text>
          </Tooltip>
        )}

        {/* Remove button */}
        {onRemove && (
          <Tooltip label="Remove column" position="top">
            <ActionIcon size="xs" variant="subtle" color="gray" onClick={onRemove} disabled={disabled} style={{ flexShrink: 0, marginLeft: hideModelSelector ? 'auto' : 0 }}>
              <IconX size={11} />
            </ActionIcon>
          </Tooltip>
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
        {/* ── PREPROCESSING (only in compare-prompts mode) ── */}
        {!hidePromptSection && (
          <Box style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '10px 14px 0' }}>
            <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <SectionHeader
                icon={<IconWand size={11} />}
                label="Preprocessing"
                open={preprocessOpen && preprocessEnabled}
                onToggle={() => preprocessEnabled && setPreprocessOpen((v) => !v)}
                accent={preprocessEnabled ? '#9775fa' : '#5c5f66'}
                badge={isPreprocessing ? <Badge size="xs" variant="dot" color="violet" ml={4}>running</Badge> : undefined}
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
                  placeholder="Enter preprocessing instructions… the user prompt will be appended and the result used as the actual prompt."
                  minRows={3}
                  maxRows={8}
                  autosize
                  disabled={disabled}
                  styles={{
                    input: { background: 'rgba(121,80,242,0.05)', border: '1px solid rgba(121,80,242,0.2)', color: '#C1C2C5', fontSize: '13px', lineHeight: '1.6' },
                  }}
                />

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
                      <Box mt={6} p={10} style={{ background: 'rgba(108,108,255,0.06)', border: '1px solid rgba(108,108,255,0.15)', borderRadius: 6, fontSize: 12, color: '#A6A7AB', fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {preprocessResult}
                        {isPreprocessing && <Box component="span" style={{ display: 'inline-block', width: 2, height: '1em', background: '#9775fa', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 0.8s step-end infinite' }} />}
                      </Box>
                    </Collapse>
                  </Box>
                )}
              </Box>
            </Collapse>
          </Box>
        )}

        {/* ── PROMPT SECTION (compare-prompts mode) ── */}
        {!hidePromptSection && (
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
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => onPromptChange(e.currentTarget.value)}
                  placeholder={`Enter ${label.toLowerCase()}…`}
                  minRows={4}
                  maxRows={14}
                  autosize
                  disabled={disabled}
                  styles={{
                    input: { background: `rgba(${borderRgb},0.04)`, border: `1px solid rgba(${borderRgb},0.2)`, color: '#C1C2C5', fontSize: '13px', lineHeight: '1.6' },
                  }}
                />
              </Box>
            </Collapse>
          </Box>
        )}

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
              {/* Actual token counts after run */}
              {(outputTokens > 0 || (isStreaming && response)) && (
                <Text size="xs" c="dimmed">
                  {outputTokens > 0
                    ? `${inputTokens.toLocaleString()} in · ${outputTokens.toLocaleString()} out`
                    : `~${tok(response).toLocaleString()} tokens…`
                  }
                </Text>
              )}
              {/* Post-run cost */}
              {cost !== null && cost >= 0 && (
                <Text size="xs" style={{ color: '#2dd4bf', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCost(cost)}
                </Text>
              )}
            </Box>
          </Box>

          <Collapse in={outputOpen}>
            <Box
              mt={10}
              style={{ minHeight: 60, position: 'relative' }}
              onMouseEnter={() => setOutputHovered(true)}
              onMouseLeave={() => setOutputHovered(false)}
            >
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
                <>
                  {/* Floating copy button */}
                  <Box
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      zIndex: 10,
                      opacity: outputHovered && !isStreaming ? 1 : 0,
                      transition: 'opacity 0.15s ease',
                      pointerEvents: outputHovered && !isStreaming ? 'auto' : 'none',
                    }}
                  >
                    <Tooltip label={copied ? 'Copied!' : 'Copy response'} position="left">
                      <ActionIcon
                        size="md"
                        onClick={handleCopy}
                        style={{
                          background: copied ? 'rgba(32,201,151,0.15)' : 'rgba(15,15,20,0.85)',
                          border: `1px solid ${copied ? 'rgba(32,201,151,0.4)' : `rgba(${borderRgb},0.3)`}`,
                          backdropFilter: 'blur(8px)',
                          color: copied ? '#2dd4bf' : '#909296',
                          borderRadius: 8,
                          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      </ActionIcon>
                    </Tooltip>
                  </Box>

                  <MarkdownOutput content={response} />
                  {isStreaming && <Box component="span" style={{ display: 'inline-block', width: 2, height: '1em', background: color, marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 0.8s step-end infinite' }} />}
                </>
              )}
            </Box>
          </Collapse>
        </Box>
      </Paper>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </Box>
  );
}
