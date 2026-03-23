import { Drawer, TextInput, Text, Box, Badge, ActionIcon, Tooltip, Loader, Button } from '@mantine/core';
import { IconSearch, IconTrash, IconLayoutColumns, IconEdit, IconCamera, IconArrowsExchange } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { listExperiments, deleteExperiment, type SavedExperiment } from '../experimentDb';

interface ExperimentDrawerProps {
  opened: boolean;
  onClose: () => void;
  onLoad: (experiment: SavedExperiment) => void;
  onCompare?: (experiment: SavedExperiment) => void;
}

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

function formatSnapshotSummary(snapshot: NonNullable<SavedExperiment['snapshot']>): string {
  const colCount = snapshot.columns.length;
  const totalTokens = snapshot.columns.reduce((sum, c) => sum + c.inputTokens + c.outputTokens, 0);
  return `${colCount} result${colCount !== 1 ? 's' : ''}, ${totalTokens.toLocaleString()} tokens`;
}

export function ExperimentDrawer({ opened, onClose, onLoad, onCompare }: ExperimentDrawerProps) {
  const [experiments, setExperiments] = useState<SavedExperiment[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setLoading(true);
    listExperiments()
      .then(setExperiments)
      .catch(() => setExperiments([]))
      .finally(() => setLoading(false));
  }, [opened]);

  const filtered = experiments.filter((exp) =>
    exp.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteExperiment(id)
      .then(() => setExperiments((prev) => prev.filter((exp) => exp.id !== id)))
      .catch(() => {});
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text fw={700} size="sm" style={{ color: '#C1C2C5' }}>Saved Experiments</Text>
          <Badge size="xs" variant="light" color="violet">{experiments.length}</Badge>
        </Box>
      }
      position="right"
      size="sm"
      styles={{
        content: { background: '#1A1B1E' },
        header: { background: '#1A1B1E', borderBottom: '1px solid rgba(255,255,255,0.06)' },
        title: { width: '100%' },
        close: { color: '#909296' },
      }}
    >
      <Box style={{ padding: '12px 0' }}>
        <TextInput
          placeholder="Search experiments..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<IconSearch size={14} color="#5c5f66" />}
          size="sm"
          styles={{
            input: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#C1C2C5' },
          }}
        />

        {loading && (
          <Box style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Loader size="sm" color="violet" />
          </Box>
        )}

        {!loading && filtered.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" style={{ padding: 32 }}>
            {experiments.length === 0 ? 'No saved experiments yet. Run an experiment to auto-save it.' : 'No experiments match your search.'}
          </Text>
        )}

        <Box style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {filtered.map((exp) => {
            const hasSnapshot = !!exp.snapshot;
            const isExpanded = expandedId === exp.id;

            return (
              <Box
                key={exp.id}
                onClick={() => {
                  // Toggle expanded if has snapshot, otherwise load directly
                  if (hasSnapshot) {
                    setExpandedId(isExpanded ? null : exp.id);
                  } else {
                    onLoad(exp);
                  }
                }}
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: `1px solid ${isExpanded ? 'rgba(121,80,242,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                  e.currentTarget.style.borderColor = 'rgba(121,80,242,0.3)';
                  e.currentTarget.style.background = 'rgba(121,80,242,0.04)';
                }}
                onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                  e.currentTarget.style.borderColor = isExpanded ? 'rgba(121,80,242,0.3)' : 'rgba(255,255,255,0.07)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
                }}
              >
                <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text size="sm" fw={600} style={{ color: '#C1C2C5', lineHeight: 1.3 }} lineClamp={1}>
                    {exp.name}
                  </Text>
                  <Tooltip label="Delete experiment" position="left">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={(e) => handleDelete(exp.id, e)}
                      style={{ flexShrink: 0 }}
                    >
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Box>
                <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Badge
                    size="xs"
                    variant="light"
                    color={exp.mode === 'models' ? 'blue' : 'grape'}
                    leftSection={exp.mode === 'models' ? <IconLayoutColumns size={9} /> : <IconEdit size={9} />}
                  >
                    {exp.mode === 'models' ? 'Models' : 'Prompts'}
                  </Badge>
                  <Badge size="xs" variant="light" color="gray">
                    {exp.columns.length} col{exp.columns.length !== 1 ? 's' : ''}
                  </Badge>
                  {hasSnapshot && (
                    <Badge size="xs" variant="light" color="yellow" leftSection={<IconCamera size={9} />}>
                      Has Results
                    </Badge>
                  )}
                  <Text size="xs" c="dimmed" style={{ marginLeft: 'auto' }}>
                    {formatRelativeTime(exp.timestamp)}
                  </Text>
                </Box>

                {/* Expanded snapshot details and action buttons */}
                {isExpanded && hasSnapshot && (
                  <Box
                    mt={10}
                    style={{
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      paddingTop: 10,
                    }}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <Text size="xs" c="dimmed" mb={6}>
                      {formatSnapshotSummary(exp.snapshot!)}
                      {exp.snapshot!.totalCost != null && ` | $${exp.snapshot!.totalCost.toFixed(4)}`}
                      {exp.snapshot!.evalResponse ? ' | Eval saved' : ''}
                    </Text>

                    {/* Truncated response previews */}
                    {exp.snapshot!.columns.slice(0, 3).map((sc, i) => (
                      <Box key={sc.id} mb={4}>
                        <Text size="xs" style={{ color: '#6b7280' }}>
                          <Text component="span" size="xs" fw={600} style={{ color: '#7950f2' }}>
                            {String.fromCharCode(65 + i)}{' '}
                          </Text>
                          {sc.response.length > 100 ? sc.response.slice(0, 100) + '...' : sc.response || '(empty)'}
                        </Text>
                      </Box>
                    ))}
                    {exp.snapshot!.columns.length > 3 && (
                      <Text size="xs" c="dimmed" mb={4}>
                        +{exp.snapshot!.columns.length - 3} more...
                      </Text>
                    )}

                    <Box style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <Button
                        variant="light"
                        color="violet"
                        size="xs"
                        leftSection={<IconLayoutColumns size={12} />}
                        onClick={() => onLoad(exp)}
                        style={{ flex: 1 }}
                      >
                        Load Config
                      </Button>
                      {onCompare && (
                        <Button
                          variant="light"
                          color="yellow"
                          size="xs"
                          leftSection={<IconArrowsExchange size={12} />}
                          onClick={() => onCompare(exp)}
                          style={{ flex: 1 }}
                        >
                          Compare
                        </Button>
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Drawer>
  );
}
