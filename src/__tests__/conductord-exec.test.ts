import { describe, it, expect } from 'vitest'

const CONDUCTORD_URL = 'http://127.0.0.1:9800'

interface ExecRequest {
  command: string
  args?: string[]
  cwd?: string
  timeout?: number
}

interface ExecResponse {
  success: boolean
  stdout?: string
  stderr?: string
  exitCode: number
  error?: string
}

async function execCommand(req: ExecRequest): Promise<ExecResponse> {
  const res = await fetch(`${CONDUCTORD_URL}/api/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  return res.json()
}

describe('conductord /api/exec', () => {
  it('should return health ok', async () => {
    const res = await fetch(`${CONDUCTORD_URL}/health`)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('should execute a simple echo command', async () => {
    const resp = await execCommand({ command: 'echo', args: ['hello'] })
    expect(resp.success).toBe(true)
    expect(resp.stdout?.trim()).toBe('hello')
    expect(resp.exitCode).toBe(0)
  })

  it('should respect cwd', async () => {
    const resp = await execCommand({ command: 'pwd', cwd: '/tmp' })
    expect(resp.success).toBe(true)
    // macOS resolves /tmp -> /private/tmp
    expect(resp.stdout?.trim()).toMatch(/\/(private\/)?tmp$/)
  })

  it('should report non-zero exit code for failing commands', async () => {
    const resp = await execCommand({ command: 'false' })
    expect(resp.success).toBe(false)
    expect(resp.exitCode).not.toBe(0)
  })

  it('should handle nonexistent commands', async () => {
    const resp = await execCommand({ command: 'this_command_does_not_exist_xyz' })
    expect(resp.success).toBe(false)
  })

  it('should handle multiple arguments', async () => {
    const resp = await execCommand({ command: 'printf', args: ['%s-%s', 'foo', 'bar'] })
    expect(resp.success).toBe(true)
    expect(resp.stdout).toBe('foo-bar')
  })

  it('should handle special characters in arguments', async () => {
    const resp = await execCommand({ command: 'echo', args: ["hello'world", '$HOME'] })
    expect(resp.success).toBe(true)
    expect(resp.stdout?.trim()).toBe("hello'world $HOME")
  })

  it('should timeout long-running commands', async () => {
    const resp = await execCommand({ command: 'sleep', args: ['10'], timeout: 1 })
    expect(resp.success).toBe(false)
    expect(resp.exitCode).toBe(-1)
    expect(resp.error).toContain('timed out')
  }, 10000)

  it('should reject empty command', async () => {
    const res = await fetch(`${CONDUCTORD_URL}/api/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('should reject GET requests', async () => {
    const res = await fetch(`${CONDUCTORD_URL}/api/exec`)
    expect(res.status).toBe(405)
  })

  it('should resolve commands from user PATH (e.g. claude)', async () => {
    const resp = await execCommand({ command: 'which', args: ['claude'] })
    // Skip if claude not installed
    if (!resp.success) return
    expect(resp.stdout?.trim()).toMatch(/claude$/)
  })

  it('should handle CORS preflight', async () => {
    const res = await fetch(`${CONDUCTORD_URL}/api/exec`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
