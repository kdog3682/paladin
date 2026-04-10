// @paladin/codemirror-editor-experiment/Editor.tsx


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

  const saveToStorage = useCallback((view: EditorView) => {
    localStorage.setItem(STORAGE_KEY, view.state.doc.toString())
    localStorage.setItem(CURSOR_KEY, String(view.state.selection.main.head))
    return true
  }, [])

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
    if (!containerRef.current) return


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

    </div>
  )
}
