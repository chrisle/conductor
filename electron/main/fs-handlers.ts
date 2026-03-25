import fs from 'fs'
import path from 'path'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

export async function readDir(dirPath: string): Promise<FileEntry[]> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter(entry => !entry.name.startsWith('.') || entry.name === '.env')
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
  } catch (err) {
    return []
  }
}

export async function readFile(filePath: string): Promise<{ success: true; content: string } | { success: false; error: string }> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return { success: true, content }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function readFileBinary(filePath: string): Promise<{ success: true; data: ArrayBuffer } | { success: false; error: string }> {
  try {
    const buffer = await fs.promises.readFile(filePath)
    return { success: true, data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function writeFile(filePath: string, content: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function mkdirRecursive(dirPath: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function deleteEntry(filePath: string): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const stat = await fs.promises.stat(filePath)
    if (stat.isDirectory()) {
      await fs.promises.rm(filePath, { recursive: true })
    } else {
      await fs.promises.unlink(filePath)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
