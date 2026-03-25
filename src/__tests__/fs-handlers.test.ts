import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readDir, readFile, writeFile, mkdirRecursive, deleteEntry } from '../../electron/main/fs-handlers'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'conductor-test-'))
})

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true })
})

describe('readDir', () => {
  it('lists files and directories', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'hello.txt'), 'hi')
    await fs.promises.mkdir(path.join(tmpDir, 'subdir'))

    const entries = await readDir(tmpDir)
    expect(entries).toHaveLength(2)
    // Directories sort first
    expect(entries[0].name).toBe('subdir')
    expect(entries[0].isDirectory).toBe(true)
    expect(entries[1].name).toBe('hello.txt')
    expect(entries[1].isFile).toBe(true)
  })

  it('hides dotfiles except .env', async () => {
    await fs.promises.writeFile(path.join(tmpDir, '.gitignore'), '')
    await fs.promises.writeFile(path.join(tmpDir, '.env'), 'SECRET=1')
    await fs.promises.writeFile(path.join(tmpDir, 'readme.md'), '')

    const entries = await readDir(tmpDir)
    const names = entries.map(e => e.name)
    expect(names).toContain('.env')
    expect(names).toContain('readme.md')
    expect(names).not.toContain('.gitignore')
  })

  it('sorts directories before files, then alphabetically', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'b.txt'), '')
    await fs.promises.writeFile(path.join(tmpDir, 'a.txt'), '')
    await fs.promises.mkdir(path.join(tmpDir, 'z-dir'))
    await fs.promises.mkdir(path.join(tmpDir, 'a-dir'))

    const entries = await readDir(tmpDir)
    const names = entries.map(e => e.name)
    expect(names).toEqual(['a-dir', 'z-dir', 'a.txt', 'b.txt'])
  })

  it('returns empty array for non-existent directory', async () => {
    const entries = await readDir(path.join(tmpDir, 'nonexistent'))
    expect(entries).toEqual([])
  })

  it('returns full paths', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'file.txt'), '')
    const entries = await readDir(tmpDir)
    expect(entries[0].path).toBe(path.join(tmpDir, 'file.txt'))
  })
})

describe('readFile', () => {
  it('reads a text file successfully', async () => {
    const filePath = path.join(tmpDir, 'test.txt')
    await fs.promises.writeFile(filePath, 'hello world')

    const result = await readFile(filePath)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.content).toBe('hello world')
    }
  })

  it('reads utf-8 content correctly', async () => {
    const filePath = path.join(tmpDir, 'unicode.txt')
    await fs.promises.writeFile(filePath, '日本語テスト 🎉')

    const result = await readFile(filePath)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.content).toBe('日本語テスト 🎉')
    }
  })

  it('returns error for non-existent file', async () => {
    const result = await readFile(path.join(tmpDir, 'missing.txt'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('ENOENT')
    }
  })
})

describe('writeFile', () => {
  it('creates a new file with content', async () => {
    const filePath = path.join(tmpDir, 'new.txt')
    const result = await writeFile(filePath, 'new content')
    expect(result.success).toBe(true)

    const content = await fs.promises.readFile(filePath, 'utf-8')
    expect(content).toBe('new content')
  })

  it('overwrites existing file', async () => {
    const filePath = path.join(tmpDir, 'existing.txt')
    await fs.promises.writeFile(filePath, 'old')

    await writeFile(filePath, 'new')
    const content = await fs.promises.readFile(filePath, 'utf-8')
    expect(content).toBe('new')
  })

  it('returns error for invalid path', async () => {
    const result = await writeFile(path.join(tmpDir, 'no', 'such', 'dir', 'file.txt'), 'x')
    expect(result.success).toBe(false)
  })
})

describe('mkdirRecursive', () => {
  it('creates nested directories', async () => {
    const dirPath = path.join(tmpDir, 'a', 'b', 'c')
    const result = await mkdirRecursive(dirPath)
    expect(result.success).toBe(true)

    const stat = await fs.promises.stat(dirPath)
    expect(stat.isDirectory()).toBe(true)
  })

  it('succeeds if directory already exists', async () => {
    const dirPath = path.join(tmpDir, 'existing')
    await fs.promises.mkdir(dirPath)

    const result = await mkdirRecursive(dirPath)
    expect(result.success).toBe(true)
  })
})

describe('deleteEntry', () => {
  it('deletes a file', async () => {
    const filePath = path.join(tmpDir, 'todelete.txt')
    await fs.promises.writeFile(filePath, 'bye')

    const result = await deleteEntry(filePath)
    expect(result.success).toBe(true)

    await expect(fs.promises.access(filePath)).rejects.toThrow()
  })

  it('deletes a directory', async () => {
    const dirPath = path.join(tmpDir, 'toremove')
    await fs.promises.mkdir(dirPath)

    const result = await deleteEntry(dirPath)
    expect(result.success).toBe(true)

    await expect(fs.promises.access(dirPath)).rejects.toThrow()
  })

  it('returns error for non-existent path', async () => {
    const result = await deleteEntry(path.join(tmpDir, 'ghost'))
    expect(result.success).toBe(false)
  })
})
