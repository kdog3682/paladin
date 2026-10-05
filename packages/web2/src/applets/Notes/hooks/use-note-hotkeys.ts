import { useMemo } from 'react'
import { toast } from '@paladin/shadcn'
import { downloadJson, useClipboard, useHotkeys, type HotkeyMap } from '@paladin/ui'
import { BOOKMARK_SLOTS, useNotes } from '../store/notes'
import { useEditorStore } from '../store/editor'
import { focusTitle, readDoc } from '../lib/editor'
import { noteTitle } from '../lib/note'

export type UseNoteHotkeysOpts = {
  /* opt+f, cmd/ctrl+k */
  onSearch: () => void
  /* cmd/ctrl+/ */
  onHelp: () => void
  /* pause every binding, eg while a dialog owns the keyboard */
  enabled?: boolean
}

const activeNote = () => {
  const s = useNotes.getState()
  return s.notes.find(n => n.id === s.activeId)
}

export const useNoteHotkeys = ({ onSearch, onHelp, enabled = true }: UseNoteHotkeysOpts) => {
  const { copy } = useClipboard()

  const map = useMemo<HotkeyMap>(() => {
    const m: HotkeyMap = {
      'alt+n': () => {
        useNotes.getState().create()
        setTimeout(focusTitle, 0)
      },
      'alt+r': () => focusTitle(),
      'cmd+r': () => focusTitle(),
      'ctrl+r': () => focusTitle(),
      'alt+d': () => {
        const note = activeNote()
        if (!note) return
        useNotes.getState().setStatus(note.id, 'deleted')
        toast(`deleted ${noteTitle(note)}`)
      },
      'alt+e': () => downloadJson('notes.json', useNotes.getState().notes),
      'alt+c': async () => {
        const note = activeNote()
        if (!note) return
        toast((await copy(readDoc(useEditorStore.getState().view) || note.content)) ? 'copied to clipboard' : 'could not reach the clipboard')
      },
      'alt+f': onSearch,
      'cmd+Slash': onHelp,
      'ctrl+Slash': onHelp,
      'cmd+k': onSearch,
      'ctrl+k': onSearch,
      'alt+ArrowUp': () => useNotes.getState().step(-1),
      'alt+ArrowDown': () => useNotes.getState().step(1),
    }

    for (const slot of BOOKMARK_SLOTS) {
      m[`alt+shift+${slot}`] = () => {
        const note = activeNote()
        if (!note) return
        useNotes.getState().bookmark(slot)
        toast(`bookmark ${slot} → ${noteTitle(note)}`)
      }
      m[`alt+${slot}`] = () => {
        if (!useNotes.getState().jump(slot)) toast(`bookmark ${slot} is empty`)
      }
    }

    return m
  }, [onSearch, onHelp, copy])

  useHotkeys(map, { enabled })
}
