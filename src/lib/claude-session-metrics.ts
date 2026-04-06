/**
 * Pure computation functions for Claude Code session metrics.
 * No filesystem dependencies — safe to import from both renderer and electron.
 *
 * Parses Claude Code JSONL transcript entries and derives:
 *   - Context window usage percentage
 *   - Input/output token processing speed
 *   - Current model identifier
 *
 * Reference: https://github.com/sirmalloc/ccstatusline
 */

export interface SessionMetrics {
  /** Context window usage as a percentage (0–100) */
  contextPercent: number | null
  /** Input token processing speed (tokens/sec) */
  inputSpeed: number | null
  /** Output token generation speed (tokens/sec) */
  outputSpeed: number | null
  /** Model identifier, e.g. "claude-opus-4-6" */
  model: string | null
}

interface TokenUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface TranscriptEntry {
  type?: string
  isSidechain?: boolean
  timestamp?: string
  message?: {
    model?: string
    usage?: TokenUsage
  }
}

// Known context window sizes by model prefix.
// Fallback is 200k which covers most Sonnet/Haiku variants.
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4': 1_000_000,
  'claude-sonnet-4': 200_000,
  'claude-haiku-4': 200_000,
}
const DEFAULT_CONTEXT_WINDOW = 200_000

function getContextWindowForModel(model: string): number {
  for (const [prefix, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.startsWith(prefix)) return size
  }
  return DEFAULT_CONTEXT_WINDOW
}

/**
 * Total input tokens for a single usage entry, including cached tokens.
 * This represents how many tokens were in the context window for that request.
 */
function totalInputTokens(usage: TokenUsage): number {
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  )
}

/**
 * Compute session metrics from raw JSONL content.
 *
 * Exported separately so it can be unit-tested without filesystem access.
 */
export function computeSessionMetrics(jsonlContent: string): SessionMetrics {
  const lines = jsonlContent.split('\n')

  // Parse only main-chain assistant entries that have usage data.
  const assistantEntries: TranscriptEntry[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const entry: TranscriptEntry = JSON.parse(line)
      if (
        entry.type === 'assistant' &&
        !entry.isSidechain &&
        entry.message?.usage &&
        entry.timestamp
      ) {
        assistantEntries.push(entry)
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (assistantEntries.length === 0) {
    return { contextPercent: null, inputSpeed: null, outputSpeed: null, model: null }
  }

  const lastEntry = assistantEntries[assistantEntries.length - 1]
  const model = lastEntry.message?.model ?? null

  // --- Context percentage ---
  // The last assistant entry's input tokens represent the full context sent to the API.
  const lastUsage = lastEntry.message!.usage!
  const contextTokens = totalInputTokens(lastUsage)
  const maxTokens = model ? getContextWindowForModel(model) : DEFAULT_CONTEXT_WINDOW
  const contextPercent = Math.min(100, (contextTokens / maxTokens) * 100)

  // --- Speed metrics ---
  // Compute from recent assistant entries within a 60-second window.
  // Speed = total tokens / wall-clock span between first and last entry in the window.
  const SPEED_WINDOW_MS = 60_000
  const now = Date.now()
  const recentEntries = assistantEntries.filter((e) => {
    const ts = new Date(e.timestamp!).getTime()
    return now - ts < SPEED_WINDOW_MS
  })

  let inputSpeed: number | null = null
  let outputSpeed: number | null = null

  if (recentEntries.length >= 2) {
    const timestamps = recentEntries.map((e) => new Date(e.timestamp!).getTime()).sort((a, b) => a - b)
    const durationMs = timestamps[timestamps.length - 1] - timestamps[0]

    if (durationMs > 0) {
      let sumInput = 0
      let sumOutput = 0
      for (const e of recentEntries) {
        sumInput += totalInputTokens(e.message!.usage!)
        sumOutput += e.message!.usage!.output_tokens ?? 0
      }
      inputSpeed = Math.round((sumInput / durationMs) * 1000)
      outputSpeed = Math.round((sumOutput / durationMs) * 1000)
    }
  }

  return { contextPercent, inputSpeed, outputSpeed, model }
}
