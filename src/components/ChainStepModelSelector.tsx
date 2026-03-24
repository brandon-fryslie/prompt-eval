import { Group, Select } from '@mantine/core';
import type { ModelGroup } from '../openai';

const USE_DEFAULT = '__use_default__';

interface ChainStepModelSelectorProps {
  model: string | undefined;
  onModelChange: (model: string | undefined) => void;
  provider: string | undefined;
  onProviderChange: (provider: string | undefined) => void;
  models: ModelGroup[];
  modelsLoading: boolean;
  providers: Array<{ value: string; label: string }>;
  defaultModelLabel?: string;
  defaultProviderLabel?: string;
  disabled?: boolean;
}

const inputStyles = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#C1C2C5', fontSize: 12, height: 26, minHeight: 26, paddingTop: 0, paddingBottom: 0,
};
const dropdownStyles = { background: '#1A1B1E', border: '1px solid rgba(255,255,255,0.1)' };
const optionStyles = { color: '#C1C2C5', fontSize: 12 };

// [LAW:one-source-of-truth] Filtering logic mirrors PromptPanel — provider filters model list
function filteredModelData(models: ModelGroup[], provider: string | undefined): Array<{ group: string; items: Array<{ value: string; label: string; provider: string }> }> {
  const withDefault = [{ group: '', items: [{ value: USE_DEFAULT, label: 'Use default', provider: '' }] }];
  const filtered = provider
    ? models.map((g) => ({ ...g, items: g.items.filter((m) => m.provider === provider) })).filter((g) => g.items.length > 0)
    : models;
  return [...withDefault, ...filtered];
}

function providerDataWithDefault(providers: Array<{ value: string; label: string }>): Array<{ value: string; label: string }> {
  return [{ value: USE_DEFAULT, label: 'Use default' }, ...providers];
}

export default function ChainStepModelSelector({
  model, onModelChange,
  provider, onProviderChange,
  models, modelsLoading,
  providers,
  defaultModelLabel, defaultProviderLabel,
  disabled,
}: ChainStepModelSelectorProps) {

  const handleProviderChange = (value: string | null) => {
    const next = value === USE_DEFAULT ? undefined : value ?? undefined;
    onProviderChange(next);
    // [LAW:dataflow-not-control-flow] Always invoke onModelChange — undefined clears when model is incompatible
    const modelStillValid = next === undefined || models.some((g) => g.items.some((m) => m.value === model && m.provider === next));
    onModelChange(modelStillValid ? model : undefined);
  };

  const handleModelChange = (value: string | null) => {
    onModelChange(value === USE_DEFAULT ? undefined : value ?? undefined);
  };

  const providerPlaceholder = defaultProviderLabel ? `Default (${defaultProviderLabel})` : 'Default';
  const modelPlaceholder = modelsLoading ? 'Loading...' : defaultModelLabel ? `Default (${defaultModelLabel})` : 'Default';

  return (
    <Group gap={6} wrap="nowrap">
      <Select
        value={provider ?? USE_DEFAULT}
        onChange={handleProviderChange}
        data={providerDataWithDefault(providers)}
        size="xs"
        disabled={disabled}
        placeholder={providerPlaceholder}
        w={130}
        styles={{ input: inputStyles, dropdown: dropdownStyles, option: optionStyles }}
      />
      <Select
        value={model ?? USE_DEFAULT}
        onChange={handleModelChange}
        data={filteredModelData(models, provider)}
        placeholder={modelPlaceholder}
        searchable
        size="xs"
        disabled={disabled}
        w={220}
        styles={{ input: inputStyles, dropdown: dropdownStyles, option: optionStyles }}
      />
    </Group>
  );
}
