import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'

interface CreateTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  columnTitle: string
  onSubmit: (description: string) => void
}

export function CreateTicketDialog({ open, onOpenChange, columnTitle, onSubmit }: CreateTicketDialogProps) {
  const [description, setDescription] = useState('')

  const handleSubmit = () => {
    if (!description.trim()) return
    onSubmit(description.trim())
    setDescription('')
    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="text-zinc-200">New ticket — {columnTitle}</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Describe what you need. Claude will generate a properly formatted Jira ticket.
          </DialogDescription>
        </DialogHeader>

        <textarea
          className="min-h-[120px] w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 outline-none placeholder-zinc-500 focus:border-zinc-500"
          placeholder="Describe the ticket..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />

        <DialogFooter>
          <Button
            variant="ghost"
            className="text-zinc-400 hover:text-zinc-200"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="bg-violet-600 text-white hover:bg-violet-500"
            disabled={!description.trim()}
            onClick={handleSubmit}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
