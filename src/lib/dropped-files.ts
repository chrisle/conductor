// Helpers for handling files dropped from the OS (Finder, etc.) into the app.

// Resolve a DataTransfer's files (and any text/uri-list / text/plain fallbacks)
// to absolute filesystem paths. Returns paths in the order they were dropped.
export function getDroppedFilePaths(dataTransfer: DataTransfer): string[] {
  const paths: string[] = []
  const files = dataTransfer.files
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const p = window.electronAPI.getPathForFile(files[i])
      if (p) paths.push(p)
    }
  }
  if (paths.length > 0) return paths

  // Fallback: file:// URIs (some OS variants and the in-app file tree drag).
  const uriList = dataTransfer.getData('text/uri-list')
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      if (trimmed.startsWith('file://')) {
        try { paths.push(decodeURIComponent(new URL(trimmed).pathname)) } catch { /* ignore */ }
      }
    }
  }
  if (paths.length > 0) return paths

  // Last resort: a plain absolute path (used by FileTreeNode internal drags).
  const plain = dataTransfer.getData('text/plain')
  if (plain && plain.startsWith('/')) paths.push(plain)
  return paths
}

// Quote a path for safe pasting into a POSIX shell prompt. Bare-prints the path
// when it contains only "safe" characters; otherwise wraps it in single quotes
// (escaping any embedded single quotes the standard `'\''` way).
export function shellQuotePath(path: string): string {
  if (/^[a-zA-Z0-9_\-./@%+=:,]+$/.test(path)) return path
  return "'" + path.replace(/'/g, "'\\''") + "'"
}

export function hasFileDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes('Files')
}
