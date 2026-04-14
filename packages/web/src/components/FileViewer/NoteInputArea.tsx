// src/components/FileViewer/NoteInputArea.tsx

import { useState, useCallback, useRef } from 'react'
import { useFileViewerStore } from './store'

export function NoteInputArea() {
  const [value, setValue] = useState('')
  const addNote = useFileViewerStore(s => s.addNote)
  const lastDeleteRef = useRef(0)

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

    if (e.key === 'Backspace') {
      const now = Date.now()
      if (value.length > 0 && now - lastDeleteRef.current < 300) {
        // double delete: remove last word
        e.preventDefault()
        const words = value.trimEnd().split(/\s+/)
        words.pop()
        setValue(words.length ? words.join(' ') + ' ' : '')
      }
      lastDeleteRef.current = now
    }
  }, [value, addNote])

  return (
    <textarea
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="write a note..."
      className="w-full h-full resize-none rounded border border-neutral-100 bg-neutral-50 p-2 text-sm text-neutral-700 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-300 transition-colors"
    />
  )
}
