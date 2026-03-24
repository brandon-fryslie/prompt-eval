import { Drawer, Box, Text, TextInput, Textarea, Button, ActionIcon, Tooltip, Badge, Paper, Group } from '@mantine/core';
import { IconPlus, IconTrash, IconArrowUp, IconArrowDown, IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import type { PromptChain, ChainStep } from '../chainTypes';
import { makeChain, makeChainStep } from '../chainTypes';
import ChainStepModelSelector from './ChainStepModelSelector';
import type { ModelGroup } from '../openai';

interface ChainEditorProps {
  opened: boolean;
  onClose: () => void;
  chains: PromptChain[];
  setChains: React.Dispatch<React.SetStateAction<PromptChain[]>>;
  models: ModelGroup[];
  modelsLoading: boolean;
  providers: Array<{ value: string; label: string }>;
}

// [LAW:one-source-of-truth] All chain mutation flows through setChains — no local shadow copies
function updateChain(setChains: React.Dispatch<React.SetStateAction<PromptChain[]>>, chainId: string, updater: (chain: PromptChain) => PromptChain) {
  setChains((prev) => prev.map((c) => (c.id === chainId ? updater(c) : c)));
}

function updateStep(setChains: React.Dispatch<React.SetStateAction<PromptChain[]>>, chainId: string, stepId: string, updater: (step: ChainStep) => ChainStep) {
  updateChain(setChains, chainId, (chain) => ({
    ...chain,
    steps: chain.steps.map((s) => (s.id === stepId ? updater(s) : s)),
  }));
}

const ACCENT = '#22b8cf';

const sectionHeader: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 10,
  fontWeight: 700,
  color: '#909296',
};

const inputStyles = {
  input: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#C1C2C5',
    fontSize: 12,
  },
};

const textareaStyles = {
  input: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#C1C2C5',
    fontSize: 12,
    minHeight: 60,
  },
};

// [LAW:one-type-per-behavior] StepCard is a single component rendering any step — variability is in props
function StepCard({
  step,
  index,
  totalSteps,
  chainId,
  setChains,
  models,
  modelsLoading,
  providers,
}: {
  step: ChainStep;
  index: number;
  totalSteps: number;
  chainId: string;
  setChains: React.Dispatch<React.SetStateAction<PromptChain[]>>;
  models: ModelGroup[];
  modelsLoading: boolean;
  providers: Array<{ value: string; label: string }>;
}) {
  const canRemove = totalSteps > 1;

  const moveStep = (direction: -1 | 1) => {
    updateChain(setChains, chainId, (chain) => {
      const steps = [...chain.steps];
      const target = index + direction;
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...chain, steps };
    });
  };

  const removeStep = () => {
    updateChain(setChains, chainId, (chain) => ({
      ...chain,
      steps: chain.steps.filter((s) => s.id !== step.id),
    }));
  };

  return (
    <Paper
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
        padding: 12,
      }}
    >
      <Group justify="space-between" mb={8}>
        <Group gap={6}>
          <Badge size="xs" variant="filled" color="cyan" style={{ minWidth: 20 }}>
            {index + 1}
          </Badge>
          <TextInput
            value={step.name}
            onChange={(e) => updateStep(setChains, chainId, step.id, (s) => ({ ...s, name: e.currentTarget.value }))}
            variant="unstyled"
            size="xs"
            styles={{ input: { color: '#C1C2C5', fontWeight: 600, fontSize: 13, padding: 0, height: 22, minHeight: 22 } }}
            style={{ flex: 1 }}
          />
        </Group>
        <Group gap={2}>
          <Tooltip label="Move up" position="top">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              disabled={index === 0}
              onClick={() => moveStep(-1)}
            >
              <IconArrowUp size={12} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Move down" position="top">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              disabled={index === totalSteps - 1}
              onClick={() => moveStep(1)}
            >
              <IconArrowDown size={12} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Remove step" position="top">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="red"
              disabled={!canRemove}
              onClick={removeStep}
            >
              <IconTrash size={12} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Textarea
        value={step.prompt}
        onChange={(e) => updateStep(setChains, chainId, step.id, (s) => ({ ...s, prompt: e.currentTarget.value }))}
        placeholder="Prompt template... use {{input}} for previous step output"
        size="xs"
        autosize
        minRows={2}
        maxRows={8}
        styles={textareaStyles}
        mb={8}
      />

      <Box>
        <Text style={{ ...sectionHeader, marginBottom: 4 }}>Model Override</Text>
        <ChainStepModelSelector
          model={step.model}
          onModelChange={(m) => updateStep(setChains, chainId, step.id, (s) => ({ ...s, model: m }))}
          provider={step.provider}
          onProviderChange={(p) => updateStep(setChains, chainId, step.id, (s) => ({ ...s, provider: p }))}
          models={models}
          modelsLoading={modelsLoading}
          providers={providers}
        />
      </Box>
    </Paper>
  );
}

function FlowArrow() {
  return (
    <Box style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
      <IconChevronDown size={16} style={{ color: ACCENT, opacity: 0.6 }} />
    </Box>
  );
}

export function ChainEditor({ opened, onClose, chains, setChains, models, modelsLoading, providers }: ChainEditorProps) {
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const selectedChain = chains.find((c) => c.id === selectedChainId) ?? null;

  const handleCreateChain = () => {
    const chain = makeChain();
    setChains((prev) => [...prev, chain]);
    setSelectedChainId(chain.id);
  };

  const handleDeleteChain = (id: string) => {
    setChains((prev) => prev.filter((c) => c.id !== id));
    // [LAW:dataflow-not-control-flow] Always update selectedChainId — value decides effect
    setSelectedChainId((prev) => (prev === id ? null : prev));
  };

  const handleAddStep = () => {
    const chain = selectedChain;
    const stepNumber = chain ? chain.steps.length + 1 : 1;
    const step = makeChainStep({ name: `Step ${stepNumber}` });
    updateChain(setChains, selectedChainId!, (c) => ({ ...c, steps: [...c.steps, step] }));
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <Text fw={700} size="sm" style={{ color: '#C1C2C5' }}>Prompt Chains</Text>
          <Badge size="xs" variant="light" color="cyan">{chains.length}</Badge>
        </Box>
      }
      position="right"
      size="md"
      styles={{
        content: { background: '#1A1B1E' },
        header: { background: '#1A1B1E', borderBottom: '1px solid rgba(255,255,255,0.06)' },
        title: { width: '100%' },
        close: { color: '#909296' },
      }}
    >
      <Box style={{ padding: '12px 0' }}>
        {/* Chain list / selector */}
        {selectedChain === null && (
          <Box>
            <Button
              variant="light"
              color="cyan"
              size="xs"
              leftSection={<IconPlus size={13} />}
              onClick={handleCreateChain}
              fullWidth
              mb={12}
              style={{ border: '1px solid rgba(34,184,207,0.2)' }}
            >
              New Chain
            </Button>

            {chains.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" mt={24}>
                No chains yet. Create one to define multi-step prompt workflows.
              </Text>
            )}

            {chains.map((chain) => (
              <Paper
                key={chain.id}
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 8,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedChainId(chain.id)}
              >
                <Group justify="space-between">
                  <Box>
                    <Text size="sm" fw={600} style={{ color: '#C1C2C5' }}>{chain.name}</Text>
                    <Text size="xs" style={{ color: '#909296' }}>
                      {chain.steps.length} step{chain.steps.length !== 1 ? 's' : ''}
                    </Text>
                  </Box>
                  <Tooltip label="Delete chain" position="left">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={(e) => { e.stopPropagation(); handleDeleteChain(chain.id); }}
                    >
                      <IconTrash size={13} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Paper>
            ))}
          </Box>
        )}

        {/* Step editor for selected chain */}
        {selectedChain !== null && (
          <Box>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => setSelectedChainId(null)}
              mb={12}
              style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7 }}
            >
              Back to chains
            </Button>

            <TextInput
              value={selectedChain.name}
              onChange={(e) => updateChain(setChains, selectedChain.id, (c) => ({ ...c, name: e.currentTarget.value }))}
              size="sm"
              mb={16}
              styles={inputStyles}
              label={<Text style={sectionHeader}>Chain Name</Text>}
            />

            <Text style={{ ...sectionHeader, marginBottom: 8 }}>Steps</Text>

            {selectedChain.steps.map((step, i) => (
              <Box key={step.id}>
                {i > 0 && <FlowArrow />}
                <StepCard
                  step={step}
                  index={i}
                  totalSteps={selectedChain.steps.length}
                  chainId={selectedChain.id}
                  setChains={setChains}
                  models={models}
                  modelsLoading={modelsLoading}
                  providers={providers}
                />
              </Box>
            ))}

            <Box mt={12}>
              <Button
                variant="light"
                color="cyan"
                size="xs"
                leftSection={<IconPlus size={13} />}
                onClick={handleAddStep}
                fullWidth
                style={{ border: '1px solid rgba(34,184,207,0.2)' }}
              >
                Add Step
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
