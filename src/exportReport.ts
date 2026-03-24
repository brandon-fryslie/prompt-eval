import { formatCost, type RubricScores, type RubricDimension } from './openai'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExportColumn {
  id: string
  label: string
  model: string
  provider: string
  prompt: string
  preprocessEnabled: boolean
  preprocessPrompt: string
  preprocessResult: string
  response: string
  inputTokens: number
  outputTokens: number
  cost: number | null
  startTime: number | null
  firstTokenTime: number | null
  endTime: number | null
}

export interface ExportData {
  mode: 'models' | 'prompts'
  columns: ExportColumn[]
  sharedPrompt: string
  sharedModel: string
  sharedProvider: string
  evalResponse: string
  rubricScores: RubricScores | null
  rubricDimensions: RubricDimension[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatTimestamp(): string {
  const now = new Date()
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Markdown Generation ───────────────────────────────────────────────────────

function buildMarkdown(data: ExportData): string {
  const lines: string[] = []
  const ts = new Date().toLocaleString()

  lines.push(`# Prompt Eval Report`)
  lines.push(``)
  lines.push(`**Generated:** ${ts}`)
  lines.push(``)

  // Configuration
  lines.push(`## Configuration`)
  lines.push(``)
  lines.push(`- **Mode:** ${data.mode === 'models' ? 'Compare Models' : 'Compare Prompts'}`)
  const sharedModel = data.mode === 'prompts' ? data.sharedModel : ''
  const sharedProvider = data.mode === 'prompts' ? data.sharedProvider : ''
  const sharedPrompt = data.mode === 'models' ? data.sharedPrompt : ''
  // [LAW:dataflow-not-control-flow] Always output these fields; empty string is the "nothing" value
  lines.push(`- **Shared Model:** ${sharedModel || '_(per-column)_'}`)
  lines.push(`- **Shared Provider:** ${sharedProvider || '_(per-column)_'}`)
  lines.push(`- **Shared Prompt:** ${sharedPrompt || '_(per-column)_'}`)
  lines.push(``)

  // Per-column sections
  lines.push(`## Responses`)
  lines.push(``)

  for (const col of data.columns) {
    lines.push(`### ${col.label}`)
    lines.push(``)
    lines.push(`- **Model:** ${col.model}`)
    lines.push(`- **Provider:** ${col.provider}`)
    lines.push(``)
    lines.push(`**Prompt:**`)
    lines.push(``)
    lines.push('```')
    lines.push(col.prompt)
    lines.push('```')
    lines.push(``)

    // [LAW:dataflow-not-control-flow] Always render preprocessing section; content varies by data
    const preprocessLabel = col.preprocessEnabled ? 'Enabled' : 'Disabled'
    const preprocessContent = col.preprocessEnabled && col.preprocessResult
      ? `\n\`\`\`\n${col.preprocessResult}\n\`\`\``
      : ''
    lines.push(`**Preprocessing:** ${preprocessLabel}${col.preprocessEnabled && col.preprocessPrompt ? ` — \`${col.preprocessPrompt}\`` : ''}`)
    lines.push(preprocessContent)
    lines.push(``)

    lines.push(`**Response:**`)
    lines.push(``)
    lines.push(col.response || '_(no response)_')
    lines.push(``)
    lines.push(`---`)
    lines.push(``)
  }

  // Comparison table
  lines.push(`## Comparison`)
  lines.push(``)
  lines.push(`| Column | Model | Input Tokens | Output Tokens | Cost | TTFT | Total Time |`)
  lines.push(`|--------|-------|-------------:|--------------:|-----:|-----:|-----------:|`)

  for (const col of data.columns) {
    const costStr = col.cost !== null ? formatCost(col.cost) : '—'
    const ttft = col.startTime !== null && col.firstTokenTime !== null
      ? formatDuration(col.firstTokenTime - col.startTime)
      : '—'
    const total = col.startTime !== null && col.endTime !== null
      ? formatDuration(col.endTime - col.startTime)
      : '—'
    lines.push(`| ${escapeTableCell(col.label)} | ${escapeTableCell(col.model)} | ${col.inputTokens} | ${col.outputTokens} | ${costStr} | ${ttft} | ${total} |`)
  }
  lines.push(``)

  // Rubric scores table
  const hasRubric = data.rubricScores !== null && data.rubricDimensions.length > 0
  const rubricScores = data.rubricScores ?? { columns: {}, summary: '' }
  const dimNames = hasRubric ? data.rubricDimensions.map((d) => d.name) : []
  // [LAW:dataflow-not-control-flow] Always output rubric section; empty data renders as "no scores"
  lines.push(`## Rubric Scores`)
  lines.push(``)

  const rubricLines = hasRubric
    ? buildRubricTable(data.columns, dimNames, rubricScores)
    : ['_(No rubric scores available)_']
  lines.push(...rubricLines)
  lines.push(``)

  // Rubric summary
  const summaryText = hasRubric && rubricScores.summary ? rubricScores.summary : ''
  lines.push(summaryText ? `**Summary:** ${summaryText}` : '')
  lines.push(``)

  // AI Evaluation
  lines.push(`## AI Evaluation`)
  lines.push(``)
  lines.push(data.evalResponse || '_(No evaluation available)_')
  lines.push(``)

  return lines.join('\n')
}

function buildRubricTable(
  columns: ExportColumn[],
  dimNames: string[],
  rubricScores: RubricScores,
): string[] {
  const lines: string[] = []
  const header = `| Column | ${dimNames.join(' | ')} |`
  const separator = `|--------${dimNames.map(() => '|------:').join('')}|`
  lines.push(header)
  lines.push(separator)

  for (const col of columns) {
    const colScores = rubricScores.columns[col.label] ?? {}
    const cells = dimNames.map((dim) => {
      const score = colScores[dim]
      return score !== undefined ? String(score) : '—'
    })
    lines.push(`| ${escapeTableCell(col.label)} | ${cells.join(' | ')} |`)
  }

  return lines
}

// ── HTML Generation ───────────────────────────────────────────────────────────

function markdownToHtml(md: string): string {
  // [LAW:single-enforcer] Escape all HTML entities once at the boundary before structural transforms
  let html = escapeHtml(md)

  // Code blocks (fenced) — content already escaped by escapeHtml above
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre><code>${code}</code></pre>`
  })

  // Inline code — content already escaped
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Tables
  html = html.replace(/((?:\|.*\|\n)+)/g, (tableBlock) => {
    const rows = tableBlock.trim().split('\n')
    const result: string[] = ['<table>']
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      // Skip separator rows
      const isSep = /^\|[\s\-:|]+\|$/.test(row.trim())
      // [LAW:dataflow-not-control-flow] Always process row; separator rows produce empty string
      const cellTag = i === 0 ? 'th' : 'td'
      const cells = row.split('|').slice(1, -1).map((c) => c.trim())
      const rowHtml = isSep
        ? ''
        : `<tr>${cells.map((c) => `<${cellTag}>${c}</${cellTag}>`).join('')}</tr>`
      result.push(rowHtml)
    }
    result.push('</table>')
    return result.filter(Boolean).join('\n')
  })

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Unordered list items
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>')

  // Paragraphs — wrap lone text lines
  html = html.replace(/^(?!<[a-z/])((?!\s*$).+)$/gm, '<p>$1</p>')

  // Clean up excess blank lines
  html = html.replace(/\n{3,}/g, '\n\n')

  return html
}

function wrapHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prompt Eval Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1b1e;
    color: #c1c2c5;
    padding: 40px;
    line-height: 1.6;
    max-width: 1100px;
    margin: 0 auto;
  }
  h1 { color: #fff; font-size: 28px; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px; }
  h2 { color: #e9ecef; font-size: 22px; margin-top: 32px; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; }
  h3 { color: #dee2e6; font-size: 18px; margin-top: 24px; margin-bottom: 8px; }
  p { margin-bottom: 8px; }
  strong { color: #e9ecef; }
  em { color: #adb5bd; }
  ul { padding-left: 24px; margin-bottom: 12px; }
  li { margin-bottom: 4px; }
  hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 20px 0; }
  pre {
    background: #141517;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 14px;
    overflow-x: auto;
    margin: 10px 0;
  }
  code {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
    color: #a9b1d6;
  }
  p > code, li > code, strong > code {
    background: rgba(255,255,255,0.06);
    padding: 2px 6px;
    border-radius: 3px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 14px;
  }
  th, td {
    border: 1px solid rgba(255,255,255,0.1);
    padding: 8px 12px;
    text-align: left;
  }
  th { background: rgba(255,255,255,0.04); color: #e9ecef; font-weight: 600; }
  td { color: #c1c2c5; }
  tr:hover td { background: rgba(255,255,255,0.02); }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

// ── Public API ────────────────────────────────────────────────────────────────

export function exportMarkdown(data: ExportData): void {
  const md = buildMarkdown(data)
  const filename = `prompt-eval-report-${formatTimestamp()}.md`
  downloadFile(md, filename, 'text/markdown')
}

export function exportHtml(data: ExportData): void {
  const md = buildMarkdown(data)
  const bodyHtml = markdownToHtml(md)
  const fullHtml = wrapHtml(bodyHtml)
  const filename = `prompt-eval-report-${formatTimestamp()}.html`
  downloadFile(fullHtml, filename, 'text/html')
}
