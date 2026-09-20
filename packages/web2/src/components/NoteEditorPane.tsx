import { Editor } from '@paladin/codemirror'
import { cn } from '@paladin/shadcn'
import { useNotes, useActiveNote } from '../store/notes'
import { useEditorStore, useEditorView } from '../store/editor'
import { useLiveDoc } from '../hooks/use-live-doc'

/* the Editor owns loading and saving; both ends are the notes store rather
   than its localStorage default, so nothing is persisted twice. */
const load = (fileId: string) => {
  const note = useNotes.getState().notes.find(n => n.id === fileId)
  return note ? { doc: note.content } : undefined
}

const save = (state: { doc: string }, fileId: string) =>
  useNotes.getState().setContent(fileId, state.doc)

export type NoteEditorPaneProps = {
  className?: string
}

export const NoteEditorPane = ({ className }: NoteEditorPaneProps) => {
  const note = useActiveNote()
  const view = useEditorView()
  const setView = useEditorStore(s => s.setView)

  // onSave is debounced 30s; this keeps titles, search and opt+c current
  useLiveDoc(view, doc => {
    const { activeId, setContent } = useNotes.getState()
    if (activeId) setContent(activeId, doc)
  })

  if (!note) return <div className={cn('flex-1', className)} />

  return (
    <Editor
      fileId={note.id}
      onLoad={load}
      onSave={save}
      onLeave={save}
      onViewReady={setView}
      className={cn('min-w-0 flex-1', className)}
    />
  )
}
