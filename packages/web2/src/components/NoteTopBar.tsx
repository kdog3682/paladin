import { useRef } from 'react'
import { cn } from '@paladin/shadcn'
import { useEditorStore } from '../store/editor'
import { noteTitle } from '../lib/note'
import { useActiveNote, useNotes } from '../store/notes'

export type NoteTopBarProps = {
  className?: string
}

export const NoteTopBar = ({ className }: NoteTopBarProps) => {
  const note = useActiveNote()
  const original = useRef('')
  if (!note) return null

  return (
    <input
      data-note-title
      key={note.id}
      defaultValue={note.title ?? (note.content.trim() ? noteTitle(note) : '')}
      onChange={e => useNotes.getState().setTitle(note.id, e.target.value)}
      placeholder="untitled"
      spellCheck={false}
      style={{ fontFamily: "'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace" }}
      onFocus={e => { original.current = e.currentTarget.value }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          if (e.currentTarget.value !== original.current) {
            e.currentTarget.value = original.current
            useNotes.getState().setTitle(note.id, original.current)
          }
          useEditorStore.getState().view?.focus()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          useEditorStore.getState().view?.focus()
        }
      }}
      className={cn(
        'fixed bottom-3 right-4 z-10 w-64 bg-transparent text-right text-[12px] font-bold outline-none placeholder:text-muted-foreground',
        className
      )}
    />
  )
}
