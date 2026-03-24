// [LAW:one-source-of-truth] Chain type definitions — single authoritative source

export interface ChainStep {
  id: string;
  name: string;
  /** The instruction for this step. Use {{input}} to reference the previous step's output (or the initial user input for step 0). */
  prompt: string;
  /** Optional model override — if omitted, uses the column/shared model */
  model?: string;
  /** Optional provider override — if omitted, uses the column/shared provider */
  provider?: string;
}

export interface PromptChain {
  id: string;
  name: string;
  steps: ChainStep[];
}

export function makeChainStep(overrides?: Partial<ChainStep>): ChainStep {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: overrides?.name ?? 'Step',
    prompt: overrides?.prompt ?? '{{input}}',
    model: overrides?.model,
    provider: overrides?.provider,
  };
}

export function makeChain(overrides?: Partial<PromptChain>): PromptChain {
  return {
    id: `chain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: overrides?.name ?? 'New Chain',
    steps: overrides?.steps ?? [makeChainStep({ name: 'Step 1' })],
  };
}
