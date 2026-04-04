/**
 * ScrollbackManager — unlimited terminal scrollback via disk persistence.
 *
 * PTY data flows through this manager which:
 *  1. Accumulates raw output into an in-memory buffer
 *  2. When the buffer exceeds a threshold, flushes older chunks to disk
 *  3. On scroll-up near the top, loads older chunks from disk into xterm
 *  4. On scroll-back-to-bottom, releases prepended content and reverts to
 *     the default in-memory window
 *
 * Disk storage uses Electron IPC (scrollback:save / scrollback:load) which
 * writes numbered chunk files under ~/Library/Application Support/Conductor/scrollback/<sessionId>/
 */

/** Chunk size in characters before flushing to disk */
const FLUSH_THRESHOLD = 256 * 1024 // 256 KB of text per chunk

/** How many lines to prepend when the user scrolls up and triggers a load */
const PREPEND_CHUNK_LINES = 500

export interface ScrollbackChunk {
  /** Chunk index — 0 is oldest */
  index: number
  /** Raw text content (ANSI stripped for disk — we store plain text) */
  data: string
}

export class ScrollbackManager {
  private sessionId: string
  /** Raw PTY data accumulated since last flush */
  private pendingBuffer = ''
  /** Number of chunks flushed to disk so far */
  private chunkCount = 0
  /** Whether disk I/O is available (Electron API present) */
  private diskAvailable: boolean
  /** Chunks currently loaded into memory (for prepending on scroll-up) */
  private loadedChunkIndex = -1
  /** Whether we have already prepended old content into the terminal */
  private hasPrependedContent = false
  /** Total accumulated plain-text (for disk persistence) */
  private plainTextBuffer = ''

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.diskAvailable = typeof window !== 'undefined' &&
      !!window.electronAPI?.scrollbackSave
  }

  /**
   * Called with every chunk of raw PTY data. Accumulates and flushes
   * to disk when the threshold is exceeded.
   */
  onData(rawData: string): void {
    // Accumulate plain text for disk storage
    const plain = stripAnsi(rawData)
    this.plainTextBuffer += plain
    this.pendingBuffer += plain

    if (this.pendingBuffer.length >= FLUSH_THRESHOLD) {
      this.flushToDisk()
    }
  }

  /**
   * Flush accumulated text to a numbered chunk file on disk.
   */
  private flushToDisk(): void {
    if (!this.diskAvailable || this.pendingBuffer.length === 0) return

    const chunk = this.pendingBuffer
    const index = this.chunkCount
    this.chunkCount++
    this.pendingBuffer = ''

    // Fire-and-forget — we don't block the render loop on disk writes
    window.electronAPI.scrollbackSave(this.sessionId, index, chunk).catch((err: unknown) => {
      console.warn('[scrollback] failed to save chunk', index, err)
    })
  }

  /**
   * Force-flush any remaining buffered data to disk (e.g. on tab teardown).
   */
  flush(): void {
    if (this.pendingBuffer.length > 0) {
      this.flushToDisk()
    }
  }

  /**
   * Returns the number of chunks that have been flushed to disk.
   */
  getChunkCount(): number {
    return this.chunkCount
  }

  /**
   * Load the next older chunk from disk. Returns the plain text
   * or null if there are no more chunks to load.
   */
  async loadOlderChunk(): Promise<string | null> {
    if (!this.diskAvailable) return null

    // Start from the most recent chunk and work backwards
    const targetIndex = this.loadedChunkIndex < 0
      ? this.chunkCount - 1
      : this.loadedChunkIndex - 1

    if (targetIndex < 0) return null

    try {
      const data = await window.electronAPI.scrollbackLoad(this.sessionId, targetIndex)
      if (data) {
        this.loadedChunkIndex = targetIndex
        this.hasPrependedContent = true
      }
      return data
    } catch (err) {
      console.warn('[scrollback] failed to load chunk', targetIndex, err)
      return null
    }
  }

  /**
   * Check whether older content has been prepended to the terminal.
   */
  getHasPrependedContent(): boolean {
    return this.hasPrependedContent
  }

  /**
   * Reset prepend state (called when user scrolls back to bottom).
   */
  resetPrependState(): void {
    this.hasPrependedContent = false
    this.loadedChunkIndex = -1
  }

  /**
   * Retrieve all buffered plain text (pending + what's been flushed).
   * Used for final save on teardown.
   */
  getPlainTextBuffer(): string {
    return this.plainTextBuffer
  }

  /**
   * Save the full remaining buffer to disk (called on unmount).
   */
  async saveRemaining(): Promise<void> {
    this.flush()
  }

  /**
   * Clean up disk files for this session.
   */
  async cleanup(): Promise<void> {
    if (!this.diskAvailable) return
    try {
      await window.electronAPI.scrollbackCleanup(this.sessionId)
    } catch (err) {
      console.warn('[scrollback] cleanup failed', err)
    }
  }
}

/**
 * Strip ANSI escape sequences from a string.
 * Keeps the plain text content for disk storage.
 */
function stripAnsi(str: string): string {
  // Comprehensive ANSI escape pattern: CSI sequences, OSC sequences,
  // character set designations, and other escape sequences
  return str.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b(\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|[()][0-9A-Za-z]|\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e])/g,
    ''
  )
}

/**
 * Split text into lines and return the last N lines.
 */
export function lastNLines(text: string, n: number): string {
  const lines = text.split('\n')
  if (lines.length <= n) return text
  return lines.slice(lines.length - n).join('\n')
}

/**
 * Split text into lines and return the first N lines.
 */
export function firstNLines(text: string, n: number): string {
  const lines = text.split('\n')
  if (lines.length <= n) return text
  return lines.slice(0, n).join('\n')
}

export { PREPEND_CHUNK_LINES }
