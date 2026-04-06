/**
 * Electron-side helpers for reading Claude Code JSONL transcript files.
 * Pure computation logic lives in src/lib/claude-session-metrics.ts.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export { computeSessionMetrics } from '../../src/lib/claude-session-metrics'
export type { SessionMetrics } from '../../src/lib/claude-session-metrics'

/**
 * Resolve the on-disk JSONL path for a Claude Code session.
 * Claude stores transcripts at: ~/.claude/projects/{projectKey}/{sessionId}.jsonl
 * where projectKey = projectPath with `/` and `.` replaced by `-`.
 */
export function getJsonlPath(sessionId: string, projectPath: string): string {
  const home = os.homedir()
  const projectKey = projectPath.replace(/[/.]/g, '-')
  return path.join(home, '.claude', 'projects', projectKey, `${sessionId}.jsonl`)
}

/**
 * Read a JSONL file efficiently by only reading the tail.
 * For speed metrics we only need the recent entries; reading the full file
 * is wasteful for long-running sessions.
 */
export async function readJsonlTail(filePath: string, tailBytes = 128 * 1024): Promise<string> {
  const stat = await fs.promises.stat(filePath)
  const fd = await fs.promises.open(filePath, 'r')
  try {
    if (stat.size <= tailBytes) {
      const buf = Buffer.alloc(stat.size)
      await fd.read(buf, 0, stat.size, 0)
      return buf.toString('utf-8')
    }
    // Read from the tail; the first partial line will be discarded by computeSessionMetrics
    // since it won't parse as valid JSON.
    const buf = Buffer.alloc(tailBytes)
    await fd.read(buf, 0, tailBytes, stat.size - tailBytes)
    return buf.toString('utf-8')
  } finally {
    await fd.close()
  }
}
