import OpenAI from 'openai';

export const MODELS = [
  { group: 'GPT-5 Frontier', items: [
    { value: 'gpt-5.4',      label: 'GPT-5.4' },
    { value: 'gpt-5.4-pro',  label: 'GPT-5.4 Pro' },
    { value: 'gpt-5',        label: 'GPT-5' },
    { value: 'gpt-5-pro',    label: 'GPT-5 Pro' },
    { value: 'gpt-5-mini',   label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano',   label: 'GPT-5 Nano' },
  ]},
  { group: 'GPT-4.1', items: [
    { value: 'gpt-4.1',      label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  ]},
  { group: 'Reasoning', items: [
    { value: 'o3-pro',  label: 'o3-pro' },
    { value: 'o3',      label: 'o3' },
    { value: 'o4-mini', label: 'o4-mini' },
    { value: 'o3-mini', label: 'o3-mini' },
    { value: 'o1-pro',  label: 'o1-pro' },
    { value: 'o1',      label: 'o1' },
  ]},
  { group: 'Specialized', items: [
    { value: 'computer-use-preview',       label: 'Computer Use Preview' },
    { value: 'gpt-4o-search-preview',      label: 'GPT-4o Search Preview' },
    { value: 'gpt-4o-mini-search-preview', label: 'GPT-4o Mini Search Preview' },
    { value: 'omni-moderation-latest',     label: 'Omni Moderation' },
  ]},
  { group: 'Previous GPT-5', items: [
    { value: 'gpt-5.2',     label: 'GPT-5.2' },
    { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
    { value: 'gpt-5.1',     label: 'GPT-5.1' },
  ]},
  { group: 'ChatGPT Models', items: [
    { value: 'gpt-5.3-chat-latest', label: 'GPT-5.3 Chat' },
    { value: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat' },
    { value: 'gpt-5.1-chat-latest', label: 'GPT-5.1 Chat' },
    { value: 'gpt-5-chat-latest',   label: 'GPT-5 Chat' },
  ]},
  { group: 'Legacy', items: [
    { value: 'gpt-4o',        label: 'GPT-4o' },
    { value: 'gpt-4o-mini',   label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
    { value: 'gpt-4',         label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ]},
  { group: 'Deprecated', items: [
    { value: 'gpt-4.5-preview', label: 'GPT-4.5 Preview' },
    { value: 'o1-mini',         label: 'o1-mini' },
    { value: 'o1-preview',      label: 'o1 Preview' },
    { value: 'davinci-002',     label: 'davinci-002' },
    { value: 'babbage-002',     label: 'babbage-002' },
  ]},
];

export function createClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}

export async function runPrompt(
  client: OpenAI,
  model: string,
  prompt: string,
  onChunk: (delta: string) => void
): Promise<string> {
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    full += delta;
    onChunk(delta);
  }
  return full;
}

export async function evaluateResponses(
  client: OpenAI,
  model: string,
  promptA: string,
  responseA: string,
  promptB: string,
  responseB: string,
  onChunk: (delta: string) => void
): Promise<string> {
  const systemPrompt = `You are an expert prompt engineer and AI output evaluator.
Your job is to objectively compare two AI responses to different prompts and provide a detailed evaluation.
Be specific, analytical, and fair. Use markdown formatting for clarity.`;

  const userMessage = `# Prompt Comparison Evaluation

## Prompt A
\`\`\`
${promptA}
\`\`\`

## Response A
${responseA}

---

## Prompt B
\`\`\`
${promptB}
\`\`\`

## Response B
${responseB}

---

Please evaluate and compare these two prompt/response pairs. Analyze:
1. **Clarity & Specificity** — Which prompt is clearer and more specific?
2. **Response Quality** — Which response is more accurate, complete, and useful?
3. **Prompt Effectiveness** — How well does each prompt elicit the desired behavior?
4. **Strengths & Weaknesses** — Key strengths and weaknesses of each
5. **Winner** — Which prompt/response pair performs better overall and why
6. **Improvement Suggestions** — How could each prompt be improved?`;

  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: true,
  });

  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    full += delta;
    onChunk(delta);
  }
  return full;
}
