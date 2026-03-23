import { Paper, Text, Box } from '@mantine/core';
import diff_match_patch from 'diff-match-patch';

// [LAW:one-source-of-truth] Single diff engine instance, reused across renders
const dmp = new diff_match_patch();

interface DiffViewProps {
  leftText: string;
  rightText: string;
  leftLabel: string;
  rightLabel: string;
}

// [LAW:one-type-per-behavior] Diff operations map to exactly one style each
const DIFF_STYLES: Record<number, { background: string; color: string; textDecoration?: string }> = {
  [-1]: { background: 'rgba(250,82,82,0.12)', color: '#ff6b6b', textDecoration: 'line-through' },
  [0]: { background: 'transparent', color: '#C1C2C5' },
  [1]: { background: 'rgba(32,201,151,0.12)', color: '#51cf66' },
};

export function DiffView({ leftText, rightText, leftLabel, rightLabel }: DiffViewProps) {
  const diffs = dmp.diff_main(leftText, rightText);
  dmp.diff_cleanupSemantic(diffs);

  return (
    <Paper style={{ background: 'rgba(45,212,191,0.025)', border: '1px solid rgba(45,212,191,0.12)', borderRadius: 10, padding: '16px 20px' }}>
      <Box style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Box style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(250,82,82,0.3)', border: '1px solid rgba(250,82,82,0.5)' }} />
          <Text size="xs" style={{ color: '#ff6b6b' }}>{leftLabel} (removed)</Text>
        </Box>
        <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Box style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(32,201,151,0.3)', border: '1px solid rgba(32,201,151,0.5)' }} />
          <Text size="xs" style={{ color: '#51cf66' }}>{rightLabel} (added)</Text>
        </Box>
      </Box>
      <Box
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 500,
          overflow: 'auto',
        }}
      >
        {diffs.map(([op, text], i) => {
          const style = DIFF_STYLES[op];
          return (
            <span
              key={i}
              style={{
                background: style.background,
                color: style.color,
                textDecoration: style.textDecoration,
                borderRadius: op !== 0 ? 2 : undefined,
                padding: op !== 0 ? '0 1px' : undefined,
              }}
            >
              {text}
            </span>
          );
        })}
      </Box>
    </Paper>
  );
}
