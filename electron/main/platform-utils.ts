import os from 'os'

/**
 * Returns true if `dir` is inside the OS temp directory.
 * Used to prevent PTY sessions from starting in volatile temp paths.
 */
export function isTempDir(dir: string): boolean {
  if (process.platform === 'win32') {
    const tmp = os.tmpdir().toLowerCase()
    return dir.toLowerCase().startsWith(tmp)
  }
  return dir.startsWith('/var/folders') || dir.startsWith('/private/var/folders')
}
