import { useMemo } from 'react'
import { toast } from '@paladin/shadcn'
import { downloadJson, useClipboard, useHotkeys, type HotkeyMap } from '@paladin/ui'
import { headingBlockAt } from '@paladin/codemirror'
import { useNotes } from '../store/notes'
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

/* the editor only reports on a debounce, so sync it before reading notes */
const syncEditor = () => {
  const { activeId, setContent } = useNotes.getState()
  const view = useEditorStore.getState().view
  if (activeId && view) setContent(activeId, readDoc(view))
}

const exportNotes = () => {
  syncEditor()
  const { notes, bookmarks } = useNotes.getState()
  downloadJson('notes.json', { version: 1, notes, bookmarks })
  toast(`exported ${notes.length} notes`)
}

const importNotes = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const n = useNotes.getState().importNotes(JSON.parse(await file.text()))
      toast(`imported ${n} notes`)
    } catch (err) {
      toast(`could not import: ${(err as Error).message}`)
    }
  }
  input.click()
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
      'alt+e': exportNotes,
      'cmd+e': exportNotes,
      'ctrl+e': exportNotes,
      'cmd+o': importNotes,
      'ctrl+o': importNotes,
      'alt+c': async () => {
        const view = useEditorStore.getState().view
        const block = view && headingBlockAt(view.state, view.state.selection.main.head)
        if (!block) return toast('nothing to copy')
        const lines = `${block.lines} ${block.lines === 1 ? 'line' : 'lines'}`
        toast((await copy(block.text)) ? `copied ${lines}` : 'could not reach the clipboard')
      },
      'alt+f': onSearch,
      'cmd+Slash': onHelp,
      'ctrl+Slash': onHelp,
      'cmd+k': onSearch,
      'ctrl+k': onSearch,
      'alt+ArrowUp': () => useNotes.getState().step(-1),
      'alt+ArrowDown': () => useNotes.getState().step(1),
    }

    return m
  }, [onSearch, onHelp, copy])

  useHotkeys(map, { enabled })
}
