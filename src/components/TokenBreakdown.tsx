import { Box, Text, Tooltip } from '@mantine/core';

export interface TokenBreakdownProps {
  preprocessEnabled: boolean;
  preprocessPromptTokens: number;
  originalPromptTokens: number;
  preprocessedResultTokens: number;
  conversationHistoryTokens: number;
  userPromptTokens: number;
  totalInputTokens: number;
  color: string;
}

interface Segment {
  label: string;
  tokens: number;
  color: string;
}

// [LAW:dataflow-not-control-flow] Build segments array unconditionally; zero-token segments produce zero-width bars
export function TokenBreakdown({
  preprocessEnabled,
  preprocessPromptTokens,
  originalPromptTokens,
  preprocessedResultTokens,
  conversationHistoryTokens,
  userPromptTokens,
  totalInputTokens,
  color,
}: TokenBreakdownProps) {
  const segments: Segment[] = [
    { label: 'Preprocessing', tokens: preprocessEnabled ? preprocessPromptTokens : 0, color: '#9775fa' },
    { label: 'History', tokens: conversationHistoryTokens, color: '#2dd4bf' },
    { label: 'Prompt', tokens: userPromptTokens, color },
  ];

  const estimatedTotal = segments.reduce((sum, s) => sum + s.tokens, 0);
  const nonZeroSegments = segments.filter((s) => s.tokens > 0);

  // [LAW:dataflow-not-control-flow] savings is always computed; zero value means no savings to display
  const savings = preprocessEnabled && originalPromptTokens > 0
    ? Math.round((1 - preprocessedResultTokens / originalPromptTokens) * 100)
    : 0;

  return (
    <Box mt={6}>
      {/* Stacked bar */}
      {estimatedTotal > 0 && (
        <Box
          style={{
            display: 'flex',
            height: 6,
            borderRadius: 3,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          {nonZeroSegments.map((seg) => {
            const pct = (seg.tokens / estimatedTotal) * 100;
            return (
              <Tooltip
                key={seg.label}
                label={`${seg.label}: ~${seg.tokens.toLocaleString()} tokens (${Math.round(pct)}%)`}
                position="top"
                withArrow
              >
                <Box
                  style={{
                    width: `${pct}%`,
                    background: seg.color,
                    opacity: 0.75,
                    transition: 'width 0.3s ease',
                    minWidth: pct > 0 ? 2 : 0,
                  }}
                />
              </Tooltip>
            );
          })}
        </Box>
      )}

      {/* Text summary */}
      <Text size="xs" style={{ color: '#5c5f66', marginTop: 3, fontSize: 10, lineHeight: 1.4 }}>
        {nonZeroSegments
          .map((s) => `~${s.tokens.toLocaleString()} ${s.label.toLowerCase()}`)
          .join(' \u00B7 ')}
        {totalInputTokens > 0 && estimatedTotal > 0 && (
          <span style={{ color: '#4a4a52' }}>{' '}\u00B7 {totalInputTokens.toLocaleString()} actual</span>
        )}
      </Text>

      {/* Preprocessing before/after */}
      {preprocessEnabled && originalPromptTokens > 0 && preprocessedResultTokens > 0 && (
        <Text size="xs" style={{ color: '#9775fa', marginTop: 1, fontSize: 10, opacity: 0.7 }}>
          Preprocessing: {originalPromptTokens.toLocaleString()} \u2192 {preprocessedResultTokens.toLocaleString()} tokens
          {savings > 0 && ` (${savings}% saved)`}
          {savings < 0 && ` (${Math.abs(savings)}% larger)`}
        </Text>
      )}
    </Box>
  );
}
