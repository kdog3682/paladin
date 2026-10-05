import type { ReactElement, ReactNode } from 'react'
import { fmtStamp } from '@paladin/ui'
import { cn } from '@paladin/shadcn'
import { noteSnippet, noteTitle, type Note } from '../lib/note'
import { useBookmarkSlot } from '../store/notes'
import { NoteContextMenu } from './NoteContextMenu'

export type NoteRowProps = {
  note: Note
  active?: boolean
  onSelect?: (id: string) => void
  className?: string
}

/* the presentational row. no store writes, so it also works inside search. */
export const NoteRow = ({ note, active, onSelect, className }: NoteRowProps) => {
  const slot = useBookmarkSlot(note.id)
  return (
    <div
      role="option"
      aria-selected={!!active}
      onClick={() => onSelect?.(note.id)}
      className={cn(
        'relative cursor-pointer border-b border-border px-3 py-2 text-muted-foreground select-none',
        'hover:bg-accent/60',
        active && 'bg-background text-foreground',
        className,
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[13px]">{noteTitle(note)}</span>
        {slot ? (
          <span className="ml-auto shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            {slot}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground/70">
        <span>{fmtStamp(note.updatedAt)}</span>
        <span className="truncate">{noteSnippet(note, 40)}</span>
      </div>
    </div>
  )
}

export type NoteListProps = {
  notes: Note[]
  activeId?: string
  onSelect?: (id: string) => void
  /* wraps every row, defaults to the right-click menu */
  renderRow?: (row: ReactElement, note: Note) => ReactNode
  className?: string
}

export const NoteList = ({ notes, activeId, onSelect, renderRow, className }: NoteListProps) => (
  <div role="listbox" className={cn('min-h-0 flex-1 overflow-y-auto', className)}>
    {notes.map(note => {
      const row = <NoteRow key={note.id} note={note} active={note.id === activeId} onSelect={onSelect} />
      return renderRow ? (
        renderRow(row, note)
      ) : (
        <NoteContextMenu key={note.id} noteId={note.id}>
          {row}
        </NoteContextMenu>
      )
    })}
  </div>
)
