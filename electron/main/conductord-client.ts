/**
 * HTTP client for communicating with conductord.
 *
 * On macOS/Linux, conductord listens on a Unix domain socket. On Windows,
 * Node does not support AF_UNIX socket files via `socketPath` (that option
 * maps to named pipes), so we fall back to TCP loopback on CONDUCTORD_TCP_PORT.
 */
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

export const IS_WIN = process.platform === 'win32'
export const CONDUCTORD_SOCKET = path.join(os.homedir(), '.conductor', 'conductord.sock')
export const CONDUCTORD_TCP_PORT = 9800
export const CONDUCTORD_TCP_HOST = '127.0.0.1'

export interface ConductordFetchOptions {
  method?: string
  body?: string
}

export function conductordFetch(urlPath: string, options?: ConductordFetchOptions): Promise<{ status: number; body: any }> {
  const method = options?.method ?? 'GET'
  return new Promise((resolve, reject) => {
    const transport = IS_WIN
      ? { host: CONDUCTORD_TCP_HOST, port: CONDUCTORD_TCP_PORT }
      : { socketPath: CONDUCTORD_SOCKET }
    const req = http.request(
      {
        ...transport,
        path: urlPath,
        method,
        headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          let body: any
          try {
            body = JSON.parse(raw)
          } catch {
            body = raw
          }
          resolve({ status: res.statusCode ?? 0, body })
        })
      }
    )
    req.on('error', (err: NodeJS.ErrnoException) => {
      console.debug(`[conductord-client] ${method} ${urlPath} -> error: ${err.message} (code=${err.code})`)
      reject(err)
    })
    if (options?.body) req.write(options.body)
    req.end()
  })
}

export async function conductordHealthCheck(): Promise<boolean> {
  try {
    const { status } = await conductordFetch('/health')
    return status === 200
  } catch {
    return false
  }
}
