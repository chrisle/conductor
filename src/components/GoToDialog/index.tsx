import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Star, Folder, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut
} from '@/components/ui/command'
import { useSidebarStore } from '@/store/sidebar'

interface GoToDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function GoToDialog({ open, onOpenChange }: GoToDialogProps): React.ReactElement {
  const { rootPath, setRootPath, favorites, removeFavorite } = useSidebarStore()
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setInputValue('')
      setSuggestions([])
    }
  }, [open])

  const resolvePath = useCallback(async (partial: string): Promise<string> => {
    if (partial.startsWith('/') || partial.startsWith('~')) return partial
    if (rootPath) {
      const home = await window.electronAPI.getHomeDir()
      const root = rootPath.startsWith(home) ? '~' + rootPath.slice(home.length) : rootPath
      return root + '/' + partial
    }
    return '~/' + partial
  }, [rootPath])

  const fetchSuggestions = useCallback(async (value: string) => {
    if (!value.trim()) {
      setSuggestions([])
      return
    }
    const resolved = await resolvePath(value)
    const results: string[] = await window.electronAPI.autocomplete(resolved)
    setSuggestions(results)
  }, [resolvePath])

  const handleInputChange = (value: string) => {
    setInputValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 80)
  }

  const navigateTo = async (path: string) => {
    let resolved = path
    if (resolved.startsWith('~')) {
      const home = await window.electronAPI.getHomeDir()
      resolved = home + resolved.slice(1)
    }
    if (resolved.endsWith('/') && resolved.length > 1) {
      resolved = resolved.slice(0, -1)
    }
    setRootPath(resolved)
    onOpenChange(false)
  }

  const friendly = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')

  const filteredFavorites = favorites.filter(f => {
    if (!inputValue) return true
    const lower = inputValue.toLowerCase()
    return friendly(f).toLowerCase().includes(lower) || f.toLowerCase().includes(lower)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 bg-zinc-900 border-zinc-700 max-w-lg" hideClose>
        <Command className="rounded-lg bg-zinc-900" shouldFilter={false}>
          <CommandInput
            placeholder={rootPath ? `Search from ${friendly(rootPath)}...` : 'Type a path...'}
            value={inputValue}
            onValueChange={handleInputChange}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {filteredFavorites.length > 0 && (
              <CommandGroup heading="Favorites">
                {filteredFavorites.map(fav => (
                  <CommandItem
                    key={'fav-' + fav}
                    value={'fav-' + fav}
                    onSelect={() => navigateTo(fav)}
                    className="group"
                  >
                    <Star className="text-yellow-500 fill-yellow-500" />
                    <span>{friendly(fav)}</span>
                    <CommandShortcut>
                      <button
                        className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); removeFavorite(fav) }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {suggestions.length > 0 && (
              <>
                {filteredFavorites.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Directories">
                  {suggestions.map(s => (
                    <CommandItem
                      key={'dir-' + s}
                      value={'dir-' + s}
                      onSelect={() => navigateTo(s)}
                    >
                      <Folder className="text-yellow-500" />
                      <span>{friendly(s)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
