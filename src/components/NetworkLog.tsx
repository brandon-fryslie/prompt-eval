// ── Network Log Panel ────────────────────────────────────────────────────────
// Collapsible panel showing all HTTP requests for transparency.
// [LAW:one-source-of-truth] Derives display state from networkLog module entries.

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import {
  Box,
  Text,
  Paper,
  Badge,
  Divider,
  Collapse,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconWorldWww,
  IconChevronDown,
  IconChevronRight,
  IconTrash,
} from '@tabler/icons-react';
import { getEntries, subscribe, clearLog, type NetworkLogEntry } from '../networkLog';

const ACCENT = '#4dabf7';
const ACCENT_BG = 'rgba(77,171,247,0.035)';
const ACCENT_BORDER = 'rgba(77,171,247,0.14)';

function useNetworkEntries(): readonly NetworkLogEntry[] {
  return useSyncExternalStore(subscribe, getEntries, getEntries);
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusColor(status: number | null, error: string | null): string {
  if (error) return 'red';
  if (status === null) return 'gray';
  if (status >= 200 && status < 300) return 'green';
  if (status >= 400) return 'red';
  return 'yellow';
}

function methodColor(method: string): string {
  return method === 'POST' ? 'violet' : method === 'GET' ? 'blue' : 'gray';
}

export function NetworkLog() {
  const entries = useNetworkEntries();
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive and panel is open
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, open]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearLog();
  }, []);

  const toggleOpen = useCallback(() => setOpen((v) => !v), []);

  return (
    <Box mt={24}>
      <Divider
        label={
          <Box
            style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
            onClick={toggleOpen}
          >
            <IconWorldWww size={13} color={ACCENT} />
            <Text size="xs" fw={600} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT }}>
              Network Log
            </Text>
            <Badge size="xs" variant="light" color="blue">{entries.length}</Badge>
            {open
              ? <IconChevronDown size={12} color={ACCENT} />
              : <IconChevronRight size={12} color={ACCENT} />}
          </Box>
        }
        labelPosition="center"
        style={{ borderColor: ACCENT_BORDER }}
        mb={14}
      />

      <Collapse in={open}>
        <Paper style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 10, padding: '12px 16px' }}>
          {/* Header row */}
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text size="xs" c="dimmed">
              All HTTP requests made by this app
            </Text>
            <Tooltip label="Clear log" position="left">
              <ActionIcon variant="subtle" color="gray" size="xs" onClick={handleClear}>
                <IconTrash size={12} />
              </ActionIcon>
            </Tooltip>
          </Box>

          {/* Column headers */}
          <Box style={{
            display: 'grid',
            gridTemplateColumns: '72px 50px 1fr 58px 58px',
            gap: 6,
            padding: '4px 0',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 4,
          }}>
            <Text size="xs" c="dimmed" fw={600}>Time</Text>
            <Text size="xs" c="dimmed" fw={600}>Method</Text>
            <Text size="xs" c="dimmed" fw={600}>URL</Text>
            <Text size="xs" c="dimmed" fw={600}>Status</Text>
            <Text size="xs" c="dimmed" fw={600} style={{ textAlign: 'right' }}>ms</Text>
          </Box>

          {/* Scrollable entries */}
          <Box
            ref={scrollRef}
            style={{
              maxHeight: 260,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            {entries.length === 0 && (
              <Text size="xs" c="dimmed" style={{ fontStyle: 'italic', padding: '12px 0', textAlign: 'center' }}>
                No requests captured yet
              </Text>
            )}
            {entries.map((entry) => (
              <Box
                key={entry.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '72px 50px 1fr 58px 58px',
                  gap: 6,
                  padding: '3px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.025)',
                  alignItems: 'center',
                }}
              >
                <Text size="xs" style={{ color: '#5c5f66', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatTime(entry.timestamp)}
                </Text>
                <Badge size="xs" variant="light" color={methodColor(entry.method)} style={{ width: 40, justifyContent: 'center' }}>
                  {entry.method}
                </Badge>
                <Tooltip label={entry.displayUrl} position="top" multiline maw={500} openDelay={400}>
                  <Text size="xs" style={{ color: '#C1C2C5', fontFamily: 'monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.displayUrl}
                  </Text>
                </Tooltip>
                <Badge
                  size="xs"
                  variant="light"
                  color={statusColor(entry.status, entry.error)}
                  style={{ width: 48, justifyContent: 'center' }}
                >
                  {entry.error ? 'ERR' : entry.status ?? '...'}
                </Badge>
                <Text size="xs" style={{ color: '#909296', fontFamily: 'monospace', fontSize: 11, textAlign: 'right' }}>
                  {entry.duration !== null ? `${entry.duration}` : '-'}
                </Text>
              </Box>
            ))}
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
}
