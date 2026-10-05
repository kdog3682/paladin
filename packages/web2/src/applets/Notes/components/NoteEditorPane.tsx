import { Editor } from '@paladin/codemirror'
import { cn } from '@paladin/shadcn'
import { useNotes, useActiveNote } from '../store/notes'
import { useEditorStore } from '../store/editor'

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
  const setView = useEditorStore(s => s.setView)

  if (!note) return <div className={cn('flex-1', className)} />

  return (
    <Editor
      fileId={note.id}
      onLoad={load}
      onSave={save}
      onLeave={save}
      onViewReady={setView}
      font="inconsolata"
      className={cn('min-w-0 flex-1 px-10 py-8', className)}
    />
  )
}
