/**
 * File logger for the Electron main process.
 * Writes timestamped logs to ~/Library/Logs/conductor.log in addition to stdout/stderr.
 */
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import os from 'os'

const LOG_PATH = join(os.homedir(), 'Library', 'Logs', 'conductor.log')

function write(level: string, args: unknown[]): void {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`
  process.stdout.write(line)
  try {
    appendFileSync(LOG_PATH, line)
  } catch {
    // If we can't write to the log file, don't crash
  }
}

export function initLogger(): void {
  try {
    mkdirSync(join(os.homedir(), 'Library', 'Logs'), { recursive: true })
    appendFileSync(LOG_PATH, `\n--- conductor started at ${new Date().toISOString()} ---\n`)
  } catch {
    // Continue even if log file setup fails
  }

  console.log = (...args: unknown[]) => write('LOG', args)
  console.debug = (...args: unknown[]) => write('DEBUG', args)
  console.warn = (...args: unknown[]) => write('WARN', args)
  console.error = (...args: unknown[]) => write('ERROR', args)
  console.info = (...args: unknown[]) => write('INFO', args)
}

export function debugLog(msg: string): void {
  write('RENDERER', [msg])
}
