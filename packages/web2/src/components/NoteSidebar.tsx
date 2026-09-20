import { Button, cn } from '@paladin/shadcn'
import { useNotes, useVisibleNotes } from '../store/notes'
import { NoteList } from './NoteList'

export type NoteSidebarProps = {
  className?: string
}

export const NoteSidebar = ({ className }: NoteSidebarProps) => {
  const notes = useVisibleNotes()
  const activeId = useNotes(s => s.activeId)
  const setActive = useNotes(s => s.setActive)
  const create = useNotes(s => s.create)

  return (
    <aside
      className={cn(
        'flex w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-muted/40',
        className,
      )}
    >
      <NoteList notes={notes} activeId={activeId} onSelect={setActive} />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => create()}
        className="shrink-0 justify-start rounded-none border-t border-border text-muted-foreground"
      >
        + New note
      </Button>
    </aside>
  )
}
