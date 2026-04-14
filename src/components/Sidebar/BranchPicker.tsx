import React, { useEffect, useState } from 'react'
import { GitBranch, FolderGit2, Check, Globe } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { useSidebarStore } from '@/store/sidebar'

interface BranchPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoPath: string
  children: React.ReactNode
}

interface Worktree {
  path: string
  branch: string
  bare: boolean
  head: string
}

interface Branch {
  name: string
  isRemote: boolean
}

export default function BranchPicker({ open, onOpenChange, repoPath, children }: BranchPickerProps): React.ReactElement {
  const { setRootPath, setGitRef, setGitRepoRoot, setVirtualPath, collapseAll, exitVirtualMode, gitRef } = useSidebarStore()
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [repoRoot, setRepoRoot] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    async function load() {
      const [wts, branchList, branch, root] = await Promise.all([
        window.electronAPI.worktreeList(repoPath),
        window.electronAPI.gitBranchList(repoPath),
        window.electronAPI.gitBranch(repoPath),
        window.electronAPI.gitRepoRoot(repoPath),
      ])
      setWorktrees(wts.filter(wt => !wt.bare))
      setCurrentBranch(branch)
      setRepoRoot(root)

      // Filter out branches that already have worktrees
      const worktreeBranches = new Set(wts.map(wt => wt.branch))
      setBranches(branchList.filter(b => !worktreeBranches.has(b.name)))
    }
    load()
  }, [open, repoPath])

  function selectWorktree(wt: Worktree) {
    exitVirtualMode()
    setRootPath(wt.path)
    onOpenChange(false)
  }

  function selectBranch(branch: Branch) {
    if (!repoRoot) return
    setGitRef(branch.name)
    setGitRepoRoot(repoRoot)
    setVirtualPath('')
    collapseAll()
    onOpenChange(false)
  }

  const localBranches = branches.filter(b => !b.isRemote)
  const remoteBranches = branches.filter(b => b.isRemote)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-zinc-900 border-zinc-700 shadow-lg shadow-black/50" side="bottom" align="start">
        <Command className="rounded-lg bg-zinc-900">
          <CommandInput placeholder="Search branches..." />
          <CommandList className="max-h-64">
            <CommandEmpty>No branches found.</CommandEmpty>

            {worktrees.length > 0 && (
              <CommandGroup heading="Worktrees">
                {worktrees.map(wt => (
                  <CommandItem
                    key={'wt-' + wt.path}
                    value={'wt-' + wt.branch}
                    onSelect={() => selectWorktree(wt)}
                  >
                    <FolderGit2 className="text-emerald-500" />
                    <span>{wt.branch}</span>
                    {wt.branch === currentBranch && !gitRef && (
                      <Check className="ml-auto text-emerald-400 shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {localBranches.length > 0 && (
              <>
                {worktrees.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Local Branches">
                  {localBranches.map(b => (
                    <CommandItem
                      key={'branch-' + b.name}
                      value={'branch-' + b.name}
                      onSelect={() => selectBranch(b)}
                    >
                      <GitBranch className="text-zinc-400" />
                      <span>{b.name}</span>
                      {b.name === gitRef && (
                        <Check className="ml-auto text-amber-400 shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {remoteBranches.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Remote Branches">
                  {remoteBranches.map(b => (
                    <CommandItem
                      key={'remote-' + b.name}
                      value={'remote-' + b.name}
                      onSelect={() => selectBranch(b)}
                    >
                      <Globe className="text-zinc-500" />
                      <span>{b.name}</span>
                      {b.name === gitRef && (
                        <Check className="ml-auto text-amber-400 shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
