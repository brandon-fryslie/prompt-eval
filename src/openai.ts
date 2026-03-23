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

// ── Rubric Types & Templates ──────────────────────────────────────────────

export interface RubricDimension {
  name: string;
  description: string; // short description for the LLM
}

export interface RubricScores {
  columns: Record<string, Record<string, number>>;
  summary: string;
}

// [LAW:one-source-of-truth] Predefined rubric templates — single authoritative list
export const RUBRIC_TEMPLATES: Record<string, RubricDimension[]> = {
  'General Quality': [
    { name: 'Accuracy', description: 'Factual correctness of the response' },
    { name: 'Clarity', description: 'How clear and understandable the response is' },
    { name: 'Completeness', description: 'Whether the response fully addresses the prompt' },
    { name: 'Relevance', description: 'How relevant the response is to the prompt' },
  ],
  'Creative Writing': [
    { name: 'Creativity', description: 'Originality and inventiveness of the writing' },
    { name: 'Coherence', description: 'Logical flow and consistency of the narrative' },
    { name: 'Style', description: 'Quality of prose, voice, and literary technique' },
    { name: 'Engagement', description: 'How compelling and interesting the writing is' },
  ],
  'Code Generation': [
    { name: 'Correctness', description: 'Whether the code is functionally correct' },
    { name: 'Efficiency', description: 'Performance and algorithmic efficiency' },
    { name: 'Readability', description: 'Code clarity, naming, and documentation' },
    { name: 'Completeness', description: 'Whether the code fully solves the problem' },
  ],
  'Factual Q&A': [
    { name: 'Accuracy', description: 'Correctness of facts and claims' },
    { name: 'Thoroughness', description: 'Depth and breadth of the answer' },
    { name: 'Clarity', description: 'How clearly the answer is communicated' },
    { name: 'Source Quality', description: 'Quality and reliability of reasoning and references' },
  ],
};

export async function evaluateWithRubric(
  client: OpenAI,
  model: string,
  entries: Array<{ label: string; prompt: string; response: string }>,
  dimensions: RubricDimension[],
  onChunk: (delta: string) => void,
): Promise<{ result: RunResult; scores: RubricScores }> {
  const dimensionList = dimensions.map((d) => `- ${d.name}: ${d.description}`).join('\n');
  const columnLabels = entries.map((e) => e.label).join(', ');

  const systemPrompt = `You are an expert AI output evaluator using a structured rubric.
Score each response on each dimension using a 1-5 scale:
1 = Very Poor, 2 = Poor, 3 = Adequate, 4 = Good, 5 = Excellent

Dimensions:
${dimensionList}

You MUST respond with ONLY valid JSON (no markdown fences, no extra text) in this exact format:
{
  "columns": {
    "${entries[0]?.label ?? 'A'}": { ${dimensions.map((d) => `"${d.name.toLowerCase()}": <score>`).join(', ')} },
    ...for each column (${columnLabels})
  },
  "summary": "Brief comparative summary (1-3 sentences)"
}

Use lowercase dimension names as keys. Scores must be integers 1-5.`;

  const sections = entries.map(({ label, prompt, response }) =>
    `## ${label}\n### Prompt\n\`\`\`\n${prompt}\n\`\`\`\n### Response\n${response}`
  ).join('\n\n---\n\n');

  const userMessage = `Evaluate these ${entries.length} responses using the rubric:\n\n${sections}`;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((chunk as any).usage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputTokens = (chunk as any).usage.prompt_tokens ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outputTokens = (chunk as any).usage.completion_tokens ?? 0;
    }
  }

  // Parse JSON from response — strip markdown fences if present
  let jsonText = text.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  let scores: RubricScores;
  try {
    scores = JSON.parse(jsonText) as RubricScores;
  } catch {
    // Fallback: empty scores with the raw text as summary
    scores = { columns: {}, summary: text };
  }

  return { result: { text, inputTokens, outputTokens }, scores };
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
