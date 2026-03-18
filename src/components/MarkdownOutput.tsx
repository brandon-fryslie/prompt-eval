import { Text, Box, Code } from '@mantine/core';
import { useMemo } from 'react';

interface Props {
  content: string;
}

// Lightweight markdown renderer — handles bold, italic, code, headings, bullets
export function MarkdownOutput({ content }: Props) {
  const lines = useMemo(() => content.split('\n'), [content]);

  return (
    <Box style={{ fontSize: 14, lineHeight: '1.7', color: '#C1C2C5' }}>
      {lines.map((line, i) => (
        <Line key={i} line={line} />
      ))}
    </Box>
  );
}

function Line({ line }: { line: string }) {
  // Code block delimiters (we handle inline only for simplicity)
  if (line.startsWith('```')) {
    return <Box style={{ height: 4 }} />;
  }

  // Headings
  const h3 = line.match(/^### (.+)/);
  if (h3) {
    return (
      <Text fw={600} size="sm" mt={12} mb={4} style={{ color: '#C9AFFE', letterSpacing: '-0.01em' }}>
        {renderInline(h3[1])}
      </Text>
    );
  }

  const h2 = line.match(/^## (.+)/);
  if (h2) {
    return (
      <Text fw={700} size="md" mt={16} mb={6} style={{ color: '#B794F4', letterSpacing: '-0.02em' }}>
        {renderInline(h2[1])}
      </Text>
    );
  }

  const h1 = line.match(/^# (.+)/);
  if (h1) {
    return (
      <Text fw={700} size="lg" mt={16} mb={8} style={{ color: '#9F7AEA', letterSpacing: '-0.03em' }}>
        {renderInline(h1[1])}
      </Text>
    );
  }

  // Horizontal rule
  if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) {
    return (
      <Box
        style={{
          borderTop: '1px solid rgba(121,80,242,0.2)',
          margin: '12px 0',
        }}
      />
    );
  }

  // Bullet lists
  const bullet = line.match(/^[\-\*] (.+)/);
  if (bullet) {
    return (
      <Box style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
        <Text size="sm" style={{ color: '#7950f2', flexShrink: 0, marginTop: 1 }}>
          ▸
        </Text>
        <Text size="sm">{renderInline(bullet[1])}</Text>
      </Box>
    );
  }

  // Numbered lists
  const numbered = line.match(/^(\d+)\. (.+)/);
  if (numbered) {
    return (
      <Box style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
        <Text size="sm" style={{ color: '#7950f2', flexShrink: 0, minWidth: 20 }}>
          {numbered[1]}.
        </Text>
        <Text size="sm">{renderInline(numbered[2])}</Text>
      </Box>
    );
  }

  // Empty line
  if (!line.trim()) {
    return <Box style={{ height: 8 }} />;
  }

  return (
    <Text size="sm" mb={2}>
      {renderInline(line)}
    </Text>
  );
}

function renderInline(text: string): React.ReactNode {
  // Process: **bold**, *italic*, `code`, ~~strike~~
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Italic *text*
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    // Inline code `text`
    const codeMatch = remaining.match(/`(.+?)`/);

    const candidates: Array<{ index: number; type: string; match: RegExpMatchArray }> = [];
    if (boldMatch?.index !== undefined) candidates.push({ index: boldMatch.index, type: 'bold', match: boldMatch });
    if (italicMatch?.index !== undefined) candidates.push({ index: italicMatch.index, type: 'italic', match: italicMatch });
    if (codeMatch?.index !== undefined) candidates.push({ index: codeMatch.index, type: 'code', match: codeMatch });

    if (candidates.length === 0) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    candidates.sort((a, b) => a.index - b.index);
    const first = candidates[0];

    if (first.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, first.index)}</span>);
    }

    const inner = first.match[1];
    if (first.type === 'bold') {
      parts.push(
        <strong key={key++} style={{ color: '#E2D9F3', fontWeight: 600 }}>
          {inner}
        </strong>
      );
    } else if (first.type === 'italic') {
      parts.push(
        <em key={key++} style={{ color: '#C9AFFE' }}>
          {inner}
        </em>
      );
    } else if (first.type === 'code') {
      parts.push(
        <Code
          key={key++}
          style={{
            background: 'rgba(121,80,242,0.15)',
            color: '#C9AFFE',
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          {inner}
        </Code>
      );
    }

    remaining = remaining.slice(first.index + first.match[0].length);
  }

  return <>{parts}</>;
}
