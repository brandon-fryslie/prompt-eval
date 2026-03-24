// [LAW:one-source-of-truth] Chain execution — single authoritative runner

import type { ChainStep } from './chainTypes';
import { runPrompt, type RunResult } from './openai';
import type OpenAI from 'openai';

export interface ChainStepResult {
  stepId: string;
  stepIndex: number;
  output: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ChainRunResult {
  stepResults: ChainStepResult[];
  finalOutput: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface ChainCallbacks {
  onStepStart: (stepIndex: number, step: ChainStep) => void;
  onStepChunk: (stepIndex: number, delta: string) => void;
  onStepComplete: (stepIndex: number, result: ChainStepResult) => void;
}

/**
 * Interpolate {{input}} placeholders in a step's prompt template.
 * If the prompt contains no {{input}} placeholder, append the input after the prompt.
 */
// [LAW:dataflow-not-control-flow] Always produce a result — variability is in the data
export function interpolateInput(template: string, input: string): string {
  const hasPlaceholder = template.includes('{{input}}');
  return hasPlaceholder
    ? template.replace(/\{\{input\}\}/g, input)
    : `${template}\n\n${input}`;
}

/**
 * Run a chain of steps sequentially. Each step's output feeds into the next step's {{input}}.
 *
 * @param steps - Ordered list of chain steps to execute
 * @param initialInput - The initial user input (fed into step 0)
 * @param defaultModel - Model to use when a step doesn't specify one
 * @param getClient - Function to get an OpenAI client for a given provider (or default)
 * @param callbacks - Progress callbacks
 */
export async function runChain(
  steps: ChainStep[],
  initialInput: string,
  defaultModel: string,
  getClient: (provider?: string) => OpenAI,
  callbacks: ChainCallbacks,
): Promise<ChainRunResult> {
  const stepResults: ChainStepResult[] = [];
  let currentInput = initialInput;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    callbacks.onStepStart(i, step);

    const promptText = interpolateInput(step.prompt, currentInput);
    const model = step.model || defaultModel;
    const client = getClient(step.provider);

    const result: RunResult = await runPrompt(
      client,
      model,
      [{ role: 'user', content: promptText }],
      (delta) => callbacks.onStepChunk(i, delta),
    );

    const stepResult: ChainStepResult = {
      stepId: step.id,
      stepIndex: i,
      output: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };

    stepResults.push(stepResult);
    callbacks.onStepComplete(i, stepResult);
    currentInput = result.text;
  }

  const totalInputTokens = stepResults.reduce((sum, r) => sum + r.inputTokens, 0);
  const totalOutputTokens = stepResults.reduce((sum, r) => sum + r.outputTokens, 0);

  return {
    stepResults,
    finalOutput: currentInput,
    totalInputTokens,
    totalOutputTokens,
  };
}
