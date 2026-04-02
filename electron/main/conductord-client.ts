/**
 * HTTP client for communicating with conductord over a Unix domain socket.
 */
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

export const CONDUCTORD_SOCKET = path.join(os.homedir(), '.conductor', 'conductord.sock')

export interface ConductordFetchOptions {
  method?: string
  body?: string
}

export function conductordFetch(urlPath: string, options?: ConductordFetchOptions): Promise<{ status: number; body: any }> {
  const method = options?.method ?? 'GET'
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: CONDUCTORD_SOCKET,
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
