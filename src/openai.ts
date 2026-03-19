import OpenAI from 'openai';

const MODELS_URL = 'https://brandon-fryslie.github.io/ai-providers-and-models/models.json';

export interface ModelItem {
  value: string;
  label: string;
}

export interface ModelGroup {
  group: string;
  items: ModelItem[];
}

export interface ModelPricing {
  input_per_million: number;
  output_per_million: number;
}

export type PricingMap = Record<string, ModelPricing>;

export interface ModelsData {
  groups: ModelGroup[];
  pricingMap: PricingMap;
}

export async function fetchModels(): Promise<ModelsData> {
  const resp = await fetch(MODELS_URL);
  const data = await resp.json();

  const pricingMap: PricingMap = {};
  const buckets: Record<string, ModelItem[]> = {
    'General Availability': [],
    'Preview': [],
    'Legacy': [],
  };

  const openai = data?.providers?.openai;
  if (!openai?.models) return { groups: [], pricingMap };

  for (const [id, model] of Object.entries(openai.models as Record<string, any>)) {
    if (model.status === 'deprecated') continue;
    if (model.pricing) pricingMap[id] = model.pricing;

    const bucket =
      model.status === 'legacy' ? 'Legacy' :
      model.status === 'preview' ? 'Preview' :
      'General Availability';

    buckets[bucket].push({ value: id, label: model.name ?? id });
  }

  const groups: ModelGroup[] = Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([group, items]) => ({
      group,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }));

  return { groups, pricingMap };
}

export function calcCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  pricingMap: PricingMap,
): number | null {
  const pricing = pricingMap[modelId];
  if (!pricing) return null;
  return (inputTokens / 1_000_000) * pricing.input_per_million
       + (outputTokens / 1_000_000) * pricing.output_per_million;
}

export function createClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RunResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export function formatCost(cost: number, prefix = ''): string {
  const s =
    cost === 0      ? '$0.00' :
    cost < 0.0001   ? `$${cost.toFixed(6)}` :
    cost < 0.001    ? `$${cost.toFixed(5)}` :
    cost < 0.01     ? `$${cost.toFixed(4)}` :
    cost < 1        ? `$${cost.toFixed(3)}` :
                      `$${cost.toFixed(2)}`;
  return prefix + s;
}

export async function runPrompt(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  onFirstToken?: () => void,
): Promise<RunResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await (client.chat.completions.create as any)({
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  });

  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let firstTokenFired = false;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    text += delta;
    if (delta) {
      if (!firstTokenFired) { firstTokenFired = true; onFirstToken?.(); }
      onChunk(delta);
    }
    if ((chunk as any).usage) {
      inputTokens = (chunk as any).usage.prompt_tokens ?? 0;
      outputTokens = (chunk as any).usage.completion_tokens ?? 0;
    }
  }
  return { text, inputTokens, outputTokens };
}

export async function evaluateResponses(
  client: OpenAI,
  model: string,
  entries: Array<{ label: string; prompt: string; response: string }>,
  onChunk: (delta: string) => void,
): Promise<RunResult> {
  const systemPrompt = `You are an expert prompt engineer and AI output evaluator.
Objectively compare AI responses to different prompts. Be specific, analytical, and fair. Use markdown.`;

  const sections = entries.map(({ label, prompt, response }) =>
    `## ${label}\n### Prompt\n\`\`\`\n${prompt}\n\`\`\`\n### Response\n${response}`
  ).join('\n\n---\n\n');

  const userMessage = `# Prompt Comparison Evaluation\n\n${sections}\n\n---\n\nEvaluate and compare these ${entries.length} prompt/response pairs:\n1. **Clarity & Specificity** — Which prompt is clearest?\n2. **Response Quality** — Which response is most accurate, complete, and useful?\n3. **Prompt Effectiveness** — How well does each prompt elicit the desired behavior?\n4. **Strengths & Weaknesses** — Key strengths and weaknesses of each\n5. **Ranking** — Rank from best to worst with explanation\n6. **Improvement Suggestions** — How could each prompt be improved?`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await (client.chat.completions.create as any)({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: true,
    stream_options: { include_usage: true },
  });

  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    text += delta;
    if (delta) onChunk(delta);
    if ((chunk as any).usage) {
      inputTokens = (chunk as any).usage.prompt_tokens ?? 0;
      outputTokens = (chunk as any).usage.completion_tokens ?? 0;
    }
  }
  return { text, inputTokens, outputTokens };
}
