import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'

export interface WorktreeResult {
  success: boolean
  path?: string
  error?: string
}

/**
 * Add (or reuse) a git worktree for the given branch.
 *
 * Handles three edge cases that vanilla `git worktree add` doesn't:
 *   1. Orphaned worktree directory (path exists but metadata was pruned)
 *   2. Empty repo with no commits (HEAD is invalid)
 *   3. Branch already exists (falls back to checkout instead of -b)
 */
export function worktreeAdd(
  repoPath: string,
  branchName: string,
  basePath?: string,
): Promise<WorktreeResult> {
  const worktreePath = basePath
    ? path.join(basePath, branchName)
    : path.join(path.dirname(repoPath), path.basename(repoPath) + '-' + branchName)

  return new Promise<WorktreeResult>((resolve) => {
    // Prune stale worktree entries first so leftover references don't block creation
    git(repoPath, ['worktree', 'prune'], () => {
      // If the worktree path already exists (e.g. from a previous failed attempt),
      // check whether it's a valid git worktree we can reuse, or an orphaned
      // directory that needs to be removed before we can recreate the worktree.
      if (fs.existsSync(worktreePath)) {
        git(worktreePath, ['rev-parse', '--git-dir'], (err) => {
          if (!err) {
            // Valid worktree — reuse it
            resolve({ success: true, path: worktreePath })
          } else {
            // Orphaned directory (metadata was pruned but dir remains) — remove and retry
            fs.promises
              .rm(worktreePath, { recursive: true, force: true })
              .then(() => addWithEmptyCheck(repoPath, branchName, worktreePath, resolve))
              .catch((rmErr) => {
                resolve({ success: false, error: `Failed to remove orphaned worktree dir: ${rmErr.message}` })
              })
          }
        })
        return
      }

      addWithEmptyCheck(repoPath, branchName, worktreePath, resolve)
    })
  })
}

function git(cwd: string, args: string[], cb: (err: Error | null, stdout?: string) => void) {
  execFile('git', ['-C', cwd, ...args], (err, stdout) => cb(err, stdout))
}

function addWithEmptyCheck(
  repoPath: string,
  branchName: string,
  worktreePath: string,
  resolve: (v: WorktreeResult) => void,
) {
  git(repoPath, ['rev-parse', 'HEAD'], (headErr) => {
    if (headErr) {
      // Empty repo: create an initial commit so branches can be created
      git(repoPath, ['commit', '--allow-empty', '-m', 'Initial commit'], (commitErr) => {
        if (commitErr) {
          resolve({ success: false, error: `Repo has no commits and failed to create one: ${commitErr.message}` })
          return
        }
        tryAdd(repoPath, branchName, worktreePath, resolve)
      })
    } else {
      tryAdd(repoPath, branchName, worktreePath, resolve)
    }
  })
}

function tryAdd(
  repoPath: string,
  branchName: string,
  worktreePath: string,
  resolve: (v: WorktreeResult) => void,
) {
  // Try creating a new branch + worktree
  git(repoPath, ['worktree', 'add', '-b', branchName, worktreePath], (err) => {
    if (!err) {
      resolve({ success: true, path: worktreePath })
      return
    }
    // Branch might already exist, try checking out the existing branch
    git(repoPath, ['worktree', 'add', worktreePath, branchName], (err2) => {
      if (err2) resolve({ success: false, error: err2.message })
      else resolve({ success: true, path: worktreePath })
    })
  })
}
