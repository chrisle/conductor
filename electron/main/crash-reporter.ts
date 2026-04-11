/**
 * Hard-crash reporter for the Electron main process.
 *
 * On an unrecoverable failure (uncaught exception, unhandled promise
 * rejection, renderer/child process gone), synchronously writes a text file
 * to `userData/crash-reports/` with the error, stack, and environment info
 * before the app exits. Because we use sync FS calls, the report survives
 * even when the process is about to be torn down by Node.
 */
import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import os from 'os'

type CrashKind =
  | 'uncaughtException'
  | 'unhandledRejection'
  | 'render-process-gone'
  | 'child-process-gone'

function crashDir(): string {
  // app.getPath('userData') is valid before 'ready' as long as appName is set,
  // which Electron does automatically on startup.
  return join(app.getPath('userData'), 'crash-reports')
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}

function formatError(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack ?? '(no stack)' }
  }
  if (typeof err === 'string') {
    return { message: err, stack: '(no stack — thrown value was a string)' }
  }
  try {
    return { message: JSON.stringify(err), stack: '(no stack — thrown value was not an Error)' }
  } catch {
    return { message: String(err), stack: '(no stack — thrown value was not an Error)' }
  }
}

function buildReport(kind: CrashKind, err: unknown, extra?: Record<string, unknown>): string {
  const { message, stack } = formatError(err)
  const lines: string[] = [
    `=== Conductor crash report ===`,
    `Kind:        ${kind}`,
    `Timestamp:   ${new Date().toISOString()}`,
    `App version: ${app.getVersion()}`,
    `Electron:    ${process.versions.electron}`,
    `Chrome:      ${process.versions.chrome}`,
    `Node:        ${process.versions.node}`,
    `Platform:    ${process.platform} ${process.arch} (${os.release()})`,
    `Uptime:      ${Math.round(process.uptime())}s`,
    `Free mem:    ${Math.round(os.freemem() / 1024 / 1024)} MB / ${Math.round(os.totalmem() / 1024 / 1024)} MB`,
    ``,
    `Error: ${message}`,
    ``,
    `Stack:`,
    stack,
  ]
  if (extra && Object.keys(extra).length > 0) {
    lines.push('', 'Extra:')
    for (const [k, v] of Object.entries(extra)) {
      lines.push(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Synchronously write a crash report to disk. Returns the file path (or
 * null if the write itself failed — at which point there's nothing we can
 * do and we fall through to the default crash behavior).
 */
function writeCrashReport(kind: CrashKind, err: unknown, extra?: Record<string, unknown>): string | null {
  try {
    const dir = crashDir()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `crash-${timestamp()}-${kind}.txt`)
    writeFileSync(file, buildReport(kind, err, extra), 'utf-8')
    return file
  } catch {
    return null
  }
}

let installed = false

export function installCrashReporter(): void {
  if (installed) return
  installed = true

  // Uncaught exception in the main process — this is the hardest crash we
  // can intercept from JS. Write the report, log, then re-exit with code 1
  // so the process still dies (matching Node's default behavior) — otherwise
  // the app would be left in an undefined state.
  process.on('uncaughtException', (err) => {
    const file = writeCrashReport('uncaughtException', err)
    try {
      console.error('[crash] uncaughtException:', err)
      if (file) console.error('[crash] report written to', file)
    } catch { /* console may be broken */ }
    // Give the write a tick to flush, then hard-exit.
    setImmediate(() => {
      try { app.exit(1) } catch { process.exit(1) }
    })
  })

  // Unhandled promise rejections are not immediately fatal, but Node's
  // default in newer versions is to terminate. Log to a report so we have
  // a record without killing the app.
  process.on('unhandledRejection', (reason) => {
    const file = writeCrashReport('unhandledRejection', reason)
    try {
      console.error('[crash] unhandledRejection:', reason)
      if (file) console.error('[crash] report written to', file)
    } catch { /* noop */ }
  })

  // Renderer process crashed, hung, or was killed by the OS. The main
  // process is still alive — just record the event. The app listener has
  // to be registered after `ready`, so we defer until then.
  app.whenReady().then(() => {
    app.on('render-process-gone', (_event, webContents, details) => {
      const err = new Error(`Renderer ${details.reason} (exitCode=${details.exitCode})`)
      const file = writeCrashReport('render-process-gone', err, {
        reason: details.reason,
        exitCode: details.exitCode,
        url: (() => { try { return webContents.getURL() } catch { return '<unknown>' } })(),
      })
      try {
        console.error('[crash] render-process-gone:', details)
        if (file) console.error('[crash] report written to', file)
      } catch { /* noop */ }
    })

    app.on('child-process-gone', (_event, details) => {
      const err = new Error(`Child process ${details.type} ${details.reason} (exitCode=${details.exitCode})`)
      const file = writeCrashReport('child-process-gone', err, {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
        serviceName: details.serviceName ?? '',
        name: details.name ?? '',
      })
      try {
        console.error('[crash] child-process-gone:', details)
        if (file) console.error('[crash] report written to', file)
      } catch { /* noop */ }
    })
  })
}
