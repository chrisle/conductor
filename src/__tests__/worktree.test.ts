import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import { worktreeAdd } from '../../electron/main/worktree'

let tmpDir: string
let repoPath: string

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8' }).trim()
}

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'conductor-wt-test-'))
  repoPath = path.join(tmpDir, 'repo')
  fs.mkdirSync(repoPath)
  git(repoPath, 'init')
  git(repoPath, 'commit', '--allow-empty', '-m', 'init')
})

afterEach(async () => {
  // Remove worktrees first to avoid git lock issues
  try { git(repoPath, 'worktree', 'prune') } catch {}
  await fs.promises.rm(tmpDir, { recursive: true, force: true })
})

describe('worktreeAdd', () => {
  it('creates a new worktree and branch', async () => {
    const result = await worktreeAdd(repoPath, 'feature-1')
    expect(result.success).toBe(true)
    expect(result.path).toBe(path.join(tmpDir, 'repo-feature-1'))
    expect(fs.existsSync(result.path!)).toBe(true)

    // Branch should exist
    const branches = git(repoPath, 'branch')
    expect(branches).toContain('feature-1')
  })

  it('checks out existing branch if -b fails', async () => {
    // Create branch without a worktree
    git(repoPath, 'branch', 'existing-branch')

    const result = await worktreeAdd(repoPath, 'existing-branch')
    expect(result.success).toBe(true)
    expect(fs.existsSync(result.path!)).toBe(true)
  })

  it('reuses a valid existing worktree directory', async () => {
    // Create worktree first
    const first = await worktreeAdd(repoPath, 'reuse-me')
    expect(first.success).toBe(true)

    // Call again — should reuse, not fail
    const second = await worktreeAdd(repoPath, 'reuse-me')
    expect(second.success).toBe(true)
    expect(second.path).toBe(first.path)
  })

  it('removes orphaned worktree directory and recreates', async () => {
    // Create worktree, then prune metadata but leave the directory
    const first = await worktreeAdd(repoPath, 'orphan-branch')
    expect(first.success).toBe(true)
    const wtPath = first.path!

    // Remove the worktree properly via git, then recreate just the directory
    // to simulate an orphaned state (dir exists, metadata pruned)
    git(repoPath, 'worktree', 'remove', '--force', wtPath)
    fs.mkdirSync(wtPath)
    fs.writeFileSync(path.join(wtPath, '.git'), 'gitdir: /nonexistent/path')

    const result = await worktreeAdd(repoPath, 'orphan-branch')
    expect(result.success).toBe(true)
    expect(result.path).toBe(wtPath)
    expect(fs.existsSync(wtPath)).toBe(true)
    // Should be a valid git worktree now
    const gitDir = git(wtPath, 'rev-parse', '--git-dir')
    expect(gitDir).toBeTruthy()
  })

  it('handles empty repo with no commits', async () => {
    // Create a fresh empty repo
    const emptyRepo = path.join(tmpDir, 'empty')
    fs.mkdirSync(emptyRepo)
    git(emptyRepo, 'init')

    const result = await worktreeAdd(emptyRepo, 'first-branch')
    expect(result.success).toBe(true)
    expect(fs.existsSync(result.path!)).toBe(true)

    // Should have created an initial commit
    const log = git(emptyRepo, 'log', '--oneline')
    expect(log).toContain('Initial commit')
  })

  it('respects basePath when provided', async () => {
    const customBase = path.join(tmpDir, 'worktrees')
    fs.mkdirSync(customBase)

    const result = await worktreeAdd(repoPath, 'custom-path', customBase)
    expect(result.success).toBe(true)
    expect(result.path).toBe(path.join(customBase, 'custom-path'))
    expect(fs.existsSync(result.path!)).toBe(true)
  })
})
