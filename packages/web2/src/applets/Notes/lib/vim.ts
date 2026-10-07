import type { NormalCommands } from '@paladin/codemirror'
import { toast } from '@paladin/shadcn'
import { BOOKMARK_SLOTS, useNotes } from '../store/notes'
import { noteTitle } from './note'

/* bookmarks from vim normal mode: `m1` marks the open note, `e1` goes to it.
   `e` is also vim's word-end, which has to give way for `e` to be a prefix */
export const NOTE_VIM_COMMANDS: NormalCommands = { e: null }

for (const slot of BOOKMARK_SLOTS) {
  NOTE_VIM_COMMANDS[`m ${slot}`] = () => {
    const { notes, activeId, bookmark } = useNotes.getState()
    const note = notes.find(n => n.id === activeId)
    if (!note) return
    bookmark(slot)
    toast(`bookmark ${slot} → ${noteTitle(note)}`)
  }
  NOTE_VIM_COMMANDS[`e ${slot}`] = () => {
    if (!useNotes.getState().jump(slot)) toast(`bookmark ${slot} is empty`)
  }
}
