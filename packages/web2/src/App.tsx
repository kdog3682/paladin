import { useEffect, useState } from 'react'
import '@paladin/codemirror/fonts.css'
import { Toaster } from '@paladin/shadcn'
import { NoteEditorPane } from './components/NoteEditorPane'
import { NoteSearchDialog } from './components/NoteSearchDialog'
import { NoteSidebar } from './components/NoteSidebar'
import { ShortcutBar } from './components/ShortcutBar'
import { useNoteHotkeys } from './hooks/use-note-hotkeys'
import { useActiveNote, useNotes } from './store/notes'

export const App = () => {
  const [searchOpen, setSearchOpen] = useState(false)
  const note = useActiveNote()
  const ensure = useNotes(s => s.ensure)

  // deleting the last note, or a stale persisted activeId, lands us here
  useEffect(() => {
    if (!note) ensure()
  }, [note, ensure])

  useNoteHotkeys({ onSearch: () => setSearchOpen(true), enabled: !searchOpen })

  return (
    <div className="flex h-screen flex-col bg-background font-mono text-sm text-foreground">
      <main className="flex min-h-0 flex-1">
        <NoteSidebar />
        <NoteEditorPane />
      </main>
      <ShortcutBar />
      <NoteSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <Toaster position="bottom-right" />
    </div>
  )
}

export default App
