// src/components/FileViewer/NoteInputArea.tsx

import { useState, useCallback, useRef, useEffect } from 'react'
import { useFileViewerStore } from './store'

export function NoteInputArea() {
  const [value, setValue] = useState('')
  const addNote = useFileViewerStore(s => s.addNote)
  const setNoteMode = useFileViewerStore(s => s.setNoteMode)
  const currentFile = useFileViewerStore(s => s.currentFile())
  const lastDeleteRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // sync noteMode with whether we have text
  useEffect(() => {
    setNoteMode(value.length > 0)
  }, [value, setNoteMode])

  // focus textarea when noteMode activates
  useEffect(() => {
    if (value.length > 0) {
      textareaRef.current?.focus()
    }
  }, [value.length])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const trimmed = value.trim()
      if (trimmed) {
        addNote(trimmed)
        setValue('')
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setValue('')
      textareaRef.current?.blur()
      return
    }

    if (e.key === 'Backspace') {
      const now = Date.now()
      if (value.length > 0 && now - lastDeleteRef.current < 300) {
        e.preventDefault()
        const words = value.trimEnd().split(/\s+/)
        words.pop()
        setValue(words.length ? words.join(' ') + ' ' : '')
      }
      lastDeleteRef.current = now
    }
  }, [value, addNote])

  const noteCount = currentFile?.notes.length ?? 0

  return (
    <div className="flex flex-col h-full">
      {noteCount > 0 && (
        <div className="text-[10px] text-neutral-400 mb-1">
          {noteCount} note{noteCount !== 1 ? 's' : ''} · esc to go back
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="write a note..."
        style={{ fontFamily: 'Courier, Courier New, monospace' }}
        className="w-full flex-1 resize-none rounded border border-neutral-100 bg-neutral-50/50 p-2 text-sm text-neutral-700 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-300 transition-colors"
      />
    </div>
  )
}
