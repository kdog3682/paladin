import type { ReactNode } from 'react'
import { useClipboard } from '@paladin/ui'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  toast,
} from '@paladin/shadcn'
import { BOOKMARK_SLOTS, useNote, useNotes } from '../store/notes'
import { useEditorStore } from '../store/editor'
import { focusTitle } from '../lib/editor'

export type NoteContextMenuProps = {
  noteId: string
  /* the row (or anything else) the menu hangs off */
  children: ReactNode
}

export const NoteContextMenu = ({ noteId, children }: NoteContextMenuProps) => {
  const note = useNote(noteId)
  const { copy } = useClipboard()
  const { setActive, setStatus, bookmark } = useNotes.getState()

  if (!note) return <>{children}</>

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          onClick={() => {
            setActive(noteId)
            setTimeout(() => focusTitle(useEditorStore.getState().view), 0)
          }}
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={async () => { await copy(note.content); toast('copied to clipboard') }}>
          Copy
        </ContextMenuItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Bookmark</ContextMenuSubTrigger>
          <ContextMenuSubContent className="grid grid-cols-5 gap-0.5 p-1">
            {BOOKMARK_SLOTS.map(slot => (
              <ContextMenuItem
                key={slot}
                className="justify-center font-mono"
                onClick={() => { bookmark(slot, noteId); toast(`bookmark ${slot} set`) }}
              >
                {slot}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setStatus(noteId, 'archived')}>Archive</ContextMenuItem>
        <ContextMenuItem onClick={() => setStatus(noteId, 'suspended')}>Suspend</ContextMenuItem>
        <ContextMenuItem variant="destructive" onClick={() => setStatus(noteId, 'deleted')}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
