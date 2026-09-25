import { useClipboard } from '@paladin/ui'
import { Button, cn, toast } from '@paladin/shadcn'
import { focusTitle, readDoc } from '../lib/editor'
import { noteTitle } from '../lib/note'
import { useEditorStore } from '../store/editor'
import { useActiveNote, useNotes } from '../store/notes'

export type NoteTopBarProps = {
  className?: string
}

export const NoteTopBar = ({ className }: NoteTopBarProps) => {
  const note = useActiveNote()
  const { copy } = useClipboard()
  if (!note) return null

  const { create, setTitle, setStatus } = useNotes.getState()

  return (
    <header
      className={cn('flex shrink-0 items-center gap-1 border-b border-border bg-muted/40 px-3 py-1', className)}
    >
      <input
        data-note-title
        key={note.id}
        defaultValue={note.title ?? (note.content.trim() ? noteTitle(note) : '')}
        onChange={e => setTitle(note.id, e.target.value)}
        placeholder="untitled"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent py-1 text-sm font-medium outline-none placeholder:text-muted-foreground"
      />
      <Button variant="ghost" size="sm" onClick={() => { create(); setTimeout(focusTitle, 0) }}>
        New
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => toast((await copy(readDoc(useEditorStore.getState().view) || note.content)) ? 'copied to clipboard' : 'could not reach the clipboard')}
      >
        Copy
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setStatus(note.id, 'archived')}>
        Archive
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setStatus(note.id, 'suspended')}>
        Suspend
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => { setStatus(note.id, 'deleted'); toast(`deleted ${noteTitle(note)}`) }}
      >
        Trash
      </Button>
    </header>
  )
}
