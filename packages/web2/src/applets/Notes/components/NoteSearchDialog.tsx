import { fmtStamp } from '@paladin/ui'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@paladin/shadcn'
import { noteSnippet, noteTitle, type Note, type NoteStatus } from '../lib/note'
import { useNotes, useSearchableNotes } from '../store/notes'

export type NoteSearchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const GROUPS: { status: NoteStatus, label: string }[] = [
  { status: 'active', label: 'Notes' },
  { status: 'archived', label: 'Archived' },
  { status: 'suspended', label: 'Suspended' },
]

/* cmdk filters on `value`, so the whole body goes in it */
const searchValue = (note: Note) => `${noteTitle(note)} ${note.kind} ${note.content}`

export const NoteSearchDialog = ({ open, onOpenChange }: NoteSearchDialogProps) => {
  const notes = useSearchableNotes()

  /* picking an archived or suspended note brings it back to the sidebar */
  const jumpTo = (id: string) => {
    const { setActive, setStatus, notes: all } = useNotes.getState()
    const note = all.find(n => n.id === id)
    if (note && note.status !== 'active') setStatus(id, 'active')
    setActive(id)
    onOpenChange(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Search notes..." />
        <CommandList>
          <CommandEmpty>No notes found.</CommandEmpty>
          {GROUPS.map(({ status, label }) => {
            const group = notes.filter(n => n.status === status)
            if (!group.length) return null
            return (
              <CommandGroup key={status} heading={label}>
                {group.map(note => (
                  <CommandItem key={note.id} value={searchValue(note)} onSelect={() => jumpTo(note.id)}>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{noteTitle(note)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {noteSnippet(note, 60)}
                      </span>
                    </div>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {fmtStamp(note.updatedAt)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
