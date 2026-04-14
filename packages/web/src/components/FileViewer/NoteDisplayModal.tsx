// src/components/FileViewer/NoteDisplayModal.tsx

import { X } from 'lucide-react'
import { useFileViewerStore } from './store'
import { getBasename } from '@/lib/getDisplayName'
import { useOverlayKeybindings } from '@/lib/keybindings'
import { useMemo } from 'react'

interface NoteDisplayModalProps {
  onClose: () => void
}

export function NoteDisplayModal({ onClose }: NoteDisplayModalProps) {
  const currentFile = useFileViewerStore(s => s.currentFile())

  const bindings = useMemo(() => [
    { keys: 'esc', label: 'Close notes', action: onClose, allowInInput: true },
  ], [onClose])

  useOverlayKeybindings('note-display', bindings)

  if (!currentFile) return null

  const basename = getBasename(currentFile.path)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[60vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <span className="text-sm font-medium text-neutral-800">
            Notes — {basename}
          </span>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {currentFile.notes.length > 0 ? (
            <div className="flex flex-col gap-2">
              {currentFile.notes.map((note, i) => (
                <div
                  key={i}
                  className="text-sm text-neutral-700 bg-neutral-50 rounded px-3 py-2"
                >
                  {note}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-neutral-400 italic text-center py-8">
              no notes yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
