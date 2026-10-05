import { useEffect, useState } from 'react'
import '@paladin/codemirror/fonts.css'
import { Toaster } from '@paladin/shadcn'
import { NoteEditorPane } from './components/NoteEditorPane'
import { NoteSearchDialog } from './components/NoteSearchDialog'
import { NoteTopBar } from './components/NoteTopBar'
import { NoteHelp } from './components/NoteHelp'
import { readDoc } from './lib/editor'
import { useEditorStore } from './store/editor'
import { useNoteHotkeys } from './hooks/use-note-hotkeys'
import { useActiveNote, useNotes } from './store/notes'

export const App = () => {
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const note = useActiveNote()
  const ensure = useNotes(s => s.ensure)

  // deleting the last note, or a stale persisted activeId, lands us here
  useEffect(() => {
    if (!note) ensure()
  }, [note, ensure])

  // the editor only reports on a debounce, so sync it before listing notes
  const openSearch = () => {
    const { activeId, setContent } = useNotes.getState()
    const view = useEditorStore.getState().view
    if (activeId && view) setContent(activeId, readDoc(view))
    setSearchOpen(true)
  }

  useNoteHotkeys({ onSearch: openSearch, onHelp: () => setHelpOpen(true), enabled: !searchOpen && !helpOpen })

  return (
    <div className="flex h-screen flex-col bg-background font-mono text-sm text-foreground">
      <NoteTopBar />
      <main className="flex min-h-0 flex-1">
        <NoteEditorPane />
      </main>
      <NoteHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <NoteSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <Toaster position="bottom-right" />
    </div>
  )
}

export default App
