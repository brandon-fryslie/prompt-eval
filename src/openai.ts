import OpenAI from 'openai';

const MODELS_URL = 'https://brandon-fryslie.github.io/ai-providers-and-models/models.json';

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
}

export interface ModelItem {
  value: string;
  label: string;
  provider: string;
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
  providers: Record<string, Provider>;
}

const OPENAI_API_SPEC = 'api.openai.com/v1';

export async function fetchModels(): Promise<ModelsData> {
  const resp = await fetch(MODELS_URL);
  const data = await resp.json();

  const pricingMap: PricingMap = {};
  const providers: Record<string, Provider> = {};
  // keyed by "providerId::bucketName"
  const buckets: Record<string, ModelItem[]> = {};

  const rawProviders = data?.providers ?? {};
  for (const [providerId, providerData] of Object.entries(rawProviders as Record<string, any>)) {
    if (providerData.api_specification !== OPENAI_API_SPEC) continue;

    const providerName: string = providerData.name ?? providerId;
    const baseUrl: string = providerData.base_url ?? '';
    providers[providerId] = { id: providerId, name: providerName, baseUrl };

    const models = providerData.models as Record<string, any> | undefined;
    if (!models) continue;

    for (const [modelId, model] of Object.entries(models)) {
      if (model.status === 'deprecated') continue;
      if (model.pricing) pricingMap[modelId] = model.pricing;

      const statusBucket =
        model.status === 'legacy' ? 'Legacy' :
        model.status === 'preview' ? 'Preview' :
        'General Availability';

      const groupKey = `${providerId}::${statusBucket}`;
      const items = buckets[groupKey] ?? (buckets[groupKey] = []);
      items.push({ value: modelId, label: model.name ?? modelId, provider: providerId });
    }
  }

  const groups: ModelGroup[] = Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => {
      const [providerId, statusBucket] = key.split('::');
      const providerName = providers[providerId]?.name ?? providerId;
      return {
        group: `${providerName} — ${statusBucket}`,
        items: items.sort((a, b) => a.label.localeCompare(b.label)),
      };
    });

  return { groups, pricingMap, providers };
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

export function createClient({ apiKey, baseUrl }: { apiKey: string; baseUrl?: string }): OpenAI {
  return new OpenAI({ apiKey, baseURL: baseUrl, dangerouslyAllowBrowser: true });
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
