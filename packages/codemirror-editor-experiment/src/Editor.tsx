// @paladin/codemirror-editor-experiment/Editor.tsx
import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@bklearn/shadcn'
import { createExtensions } from './extensions'

const NOTES_KEY = 'codemirror-editor-notes-v1'
const CURRENT_NOTE_ID_KEY = 'codemirror-editor-current-note-id-v1'
const DEFAULT_NOTE_TITLE = 'Untitled'

type Note = {
  id: string
  title: string
  content: string
  cursor: number
}

type PickerMode = 'open' | 'new'

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createNote(title: string): Note {
  return {
    id: makeId(),
    title,
    content: '',
    cursor: 0,
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function loadNotesFromStorage(): { notes: Note[]; currentNoteId: string } {
  let parsed: unknown = []
  try {
    parsed = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]')
  } catch {
    parsed = []
  }

  const notes: Note[] = Array.isArray(parsed)
    ? parsed
        .filter((entry): entry is Partial<Note> => typeof entry === 'object' && entry !== null)
        .map(entry => ({
          id: typeof entry.id === 'string' ? entry.id : makeId(),
          title: typeof entry.title === 'string' ? entry.title : DEFAULT_NOTE_TITLE,
          content: typeof entry.content === 'string' ? entry.content : '',
          cursor: typeof entry.cursor === 'number' ? entry.cursor : 0,
        }))
    : []

  if (notes.length === 0) {
    const note = createNote(DEFAULT_NOTE_TITLE)
    return { notes: [note], currentNoteId: note.id }
  }

  const storedCurrentId = localStorage.getItem(CURRENT_NOTE_ID_KEY) ?? ''
  const currentNoteId = notes.some(note => note.id === storedCurrentId) ? storedCurrentId : notes[0].id
  return { notes, currentNoteId }
}

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const notesRef = useRef<Note[]>([])
  const currentNoteIdRef = useRef<string>('')
  const [currentTitle, setCurrentTitle] = useState(DEFAULT_NOTE_TITLE)
  const [currentNoteId, setCurrentNoteId] = useState('')
  const [notesList, setNotesList] = useState<Note[]>([])
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerHint, setPickerHint] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const syncNotesList = useCallback(() => {
    const sorted = [...notesRef.current].sort((a, b) => a.title.localeCompare(b.title))
    setNotesList(sorted)
  }, [])

  const persistStore = useCallback(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notesRef.current))
    localStorage.setItem(CURRENT_NOTE_ID_KEY, currentNoteIdRef.current)
  }, [])

  const getCurrentNote = useCallback(() => {
    return notesRef.current.find(note => note.id === currentNoteIdRef.current) ?? null
  }, [])

  const saveToStorage = useCallback(
    (view: EditorView) => {
      const note = getCurrentNote()
      if (!note) return false
      note.content = view.state.doc.toString()
      note.cursor = view.state.selection.main.head
      persistStore()
      return true
    },
    [getCurrentNote, persistStore],
  )

  const closePicker = useCallback(() => {
    setPickerMode(null)
    setPickerQuery('')
    setPickerHint('')
    requestAnimationFrame(() => viewRef.current?.focus())
  }, [])

  const showNoteInEditor = useCallback((note: Note) => {
    const view = viewRef.current
    if (!view) return
    const cursor = Math.min(note.cursor, note.content.length)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: note.content },
      selection: { anchor: cursor },
      scrollIntoView: true,
    })
    setCurrentTitle(note.title)
    setCurrentNoteId(note.id)
    view.focus()
  }, [])

  const switchToNote = useCallback(
    (noteId: string) => {
      const note = notesRef.current.find(entry => entry.id === noteId)
      if (!note) return
      if (viewRef.current) saveToStorage(viewRef.current)
      currentNoteIdRef.current = note.id
      persistStore()
      showNoteInEditor(note)
    },
    [persistStore, saveToStorage, showNoteInEditor],
  )

  const createOrOpenNote = useCallback(
    (rawTitle: string) => {
      const title = rawTitle.trim()
      if (!title) {
        setPickerHint('Enter a title first.')
        return
      }

      const existing = notesRef.current.find(note => normalize(note.title) === normalize(title))
      if (existing) {
        switchToNote(existing.id)
        closePicker()
        return
      }

      if (viewRef.current) saveToStorage(viewRef.current)

      const note = createNote(title)
      notesRef.current = [...notesRef.current, note]
      currentNoteIdRef.current = note.id
      persistStore()
      syncNotesList()
      showNoteInEditor(note)
      closePicker()
    },
    [closePicker, persistStore, saveToStorage, showNoteInEditor, switchToNote, syncNotesList],
  )

  const deleteCurrentNote = useCallback(() => {
    const currentNote = getCurrentNote()
    if (!currentNote) return

    const remaining = notesRef.current.filter(note => note.id !== currentNote.id)
    if (remaining.length === 0) {
      const replacement = createNote(DEFAULT_NOTE_TITLE)
      notesRef.current = [replacement]
      currentNoteIdRef.current = replacement.id
      persistStore()
      syncNotesList()
      showNoteInEditor(replacement)
      return
    }

    const nextNote = remaining[0]
    notesRef.current = remaining
    currentNoteIdRef.current = nextNote.id
    persistStore()
    syncNotesList()
    showNoteInEditor(nextNote)
  }, [getCurrentNote, persistStore, showNoteInEditor, syncNotesList])

  const openPicker = useCallback((mode: PickerMode) => {
    setPickerMode(mode)
    setPickerQuery('')
    setPickerHint('')
  }, [])

  const queryTrimmed = pickerQuery.trim()
  const existingForQuery = useMemo(() => {
    if (!queryTrimmed) return null
    return notesList.find(note => normalize(note.title) === normalize(queryTrimmed)) ?? null
  }, [notesList, queryTrimmed])

  useEffect(() => {
    const save = () => {
      if (viewRef.current) saveToStorage(viewRef.current)
    }
    window.addEventListener('blur', save)
    document.addEventListener('visibilitychange', save)
    return () => {
      window.removeEventListener('blur', save)
      document.removeEventListener('visibilitychange', save)
    }
  }, [saveToStorage])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (pickerMode) return
      if (!event.ctrlKey && !event.metaKey) return

      const key = event.key.toLowerCase()
      if (key === 'o') {
        event.preventDefault()
        openPicker('open')
        return
      }

      if (key === 'n') {
        event.preventDefault()
        openPicker('new')
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [openPicker, pickerMode])

  useEffect(() => {
    if (!containerRef.current) return

    const { notes, currentNoteId: loadedCurrentId } = loadNotesFromStorage()
    notesRef.current = notes
    currentNoteIdRef.current = loadedCurrentId
    persistStore()
    syncNotesList()

    const currentNote = notes.find(note => note.id === loadedCurrentId) ?? notes[0]
    setCurrentTitle(currentNote.title)
    setCurrentNoteId(currentNote.id)
    const cursor = Math.min(currentNote.cursor, currentNote.content.length)

    const view = new EditorView({
      state: EditorState.create({
        doc: currentNote.content,
        extensions: createExtensions(saveToStorage),
        selection: { anchor: cursor },
      }),
      parent: containerRef.current,
    })
    viewRef.current = view
    view.focus()

    return () => {
      saveToStorage(view)
      view.destroy()
      viewRef.current = null
    }
  }, [persistStore, saveToStorage, syncNotesList])

  return (
    <div className="editor-shell">
      <div className="editor-frame">
        <div ref={containerRef} className="editor-container" />
        <div className="status-bar">
          <div className="status-meta">
            <span className="status-title">Current note</span>
            <Badge variant="secondary">{currentTitle}</Badge>
          </div>
          <div className="status-controls">
            <span className="status-shortcuts">Ctrl+N new | Ctrl+O open</span>
            <Button size="sm" variant="outline" onClick={() => setDeleteDialogOpen(true)}>
              Delete Note
            </Button>
          </div>
        </div>
      </div>

      <CommandDialog
        open={pickerMode !== null}
        onOpenChange={open => {
          if (!open) closePicker()
        }}
        title={pickerMode === 'new' ? 'Create Note' : 'Open Note'}
        description={
          pickerMode === 'new'
            ? 'Fuzzy pick existing notes or create a new one by title.'
            : 'Fuzzy pick a note to open.'
        }
        className="max-w-xl"
      >
        <CommandInput
          value={pickerQuery}
          onValueChange={value => {
            setPickerQuery(value)
            if (pickerHint) setPickerHint('')
          }}
          placeholder={pickerMode === 'new' ? 'Type a title for a new note...' : 'Search notes...'}
        />
        <CommandList>
          {pickerMode === 'open' && (
            <>
              <CommandEmpty>No notes found.</CommandEmpty>
              <CommandGroup heading="Notes">
                {notesList.map(note => (
                  <CommandItem
                    key={note.id}
                    value={note.title}
                    onSelect={() => {
                      switchToNote(note.id)
                      closePicker()
                    }}
                  >
                    <span>{note.title}</span>
                    {note.id === currentNoteId && <CommandShortcut>current</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {pickerMode === 'new' && (
            <>
              {!queryTrimmed && <CommandEmpty>Type a title to create a note.</CommandEmpty>}
              {queryTrimmed && (
                <CommandGroup heading="Action">
                  <CommandItem
                    value={queryTrimmed}
                    onSelect={() => {
                      createOrOpenNote(queryTrimmed)
                    }}
                  >
                    <span>
                      {existingForQuery ? `Open existing "${existingForQuery.title}"` : `Create "${queryTrimmed}"`}
                    </span>
                    <CommandShortcut>enter</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup heading="Existing Notes">
                {notesList.map(note => (
                  <CommandItem
                    key={note.id}
                    value={note.title}
                    onSelect={() => {
                      switchToNote(note.id)
                      closePicker()
                    }}
                  >
                    <span>{note.title}</span>
                    {note.id === currentNoteId && <CommandShortcut>current</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
        {pickerHint && <div className="picker-hint">{pickerHint}</div>}
      </CommandDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete This Note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{currentTitle}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteCurrentNote}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
            >
              Delete Note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
