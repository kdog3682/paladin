// src/components/FileViewer/NoteInputArea.tsx

import { useNoteInputStore } from './noteInputStore'

export function NoteInputArea() {
  const value = useNoteInputStore(s => s.value)

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-neutral-400 font-mono">note</div>
      <div className="text-sm text-neutral-700 font-mono min-h-[1.5em] whitespace-pre-wrap break-words">
        {value || <span className="text-neutral-300">type a note…</span>}
      </div>
    </div>
  )
}
