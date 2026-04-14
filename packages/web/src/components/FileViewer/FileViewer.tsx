// src/components/FileViewer/FileViewer.tsx

import { useMemo } from 'react'
import { useAppletKeybindings } from '@/lib/keybindings'
import { useFileViewerStore } from './store'

export function FileViewer() {
  const currentFile = useFileViewerStore(s => s.currentFile())
  const nextFile = useFileViewerStore(s => s.nextFile)
  const prevFile = useFileViewerStore(s => s.prevFile)
  const toggleDiff = useFileViewerStore(s => s.toggleDiff)
  const toggleMark = useFileViewerStore(s => s.toggleMark)

  const bindings = useMemo(() => [
    { keys: 'shift+down', label: 'Next file', action: nextFile },
    { keys: 'shift+up', label: 'Previous file', action: prevFile },
    { keys: 'ctrl+e', label: 'Export', action: () => console.log('export') },
    { keys: 'ctrl+o', label: 'Open file', action: () => console.log('open file picker') },
    { keys: 'ctrl+shift+o', label: 'Switch source', action: () => console.log('switch source') },
  ], [nextFile, prevFile])

  useAppletKeybindings('file-viewer', bindings)

  return (
    <div className="flex h-full p-3 gap-3">
      {/* editor pane */}
      <div className="flex-1 min-w-0 rounded-lg bg-white">
        <div className="p-4 h-full flex flex-col">
          <div className="text-xs text-neutral-400 font-mono mb-2">
            {currentFile?.path ?? 'No file selected'}
          </div>
          <div className="flex-1 rounded bg-neutral-50 border border-neutral-100 p-4 font-mono text-sm text-neutral-700 overflow-auto">
            {/* CodeMirror goes here */}
            <p className="text-neutral-400 italic">editor placeholder</p>
          </div>
        </div>
      </div>

      {/* side panel */}
      <div
        className="w-72 shrink-0 flex flex-col rounded-lg bg-white"
        style={{ boxShadow: '-4px 0 24px -8px rgba(0,0,0,0.06)' }}
      >
        {/* action bar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-neutral-100">
          <ActionButton label="Diff" onClick={toggleDiff} />
          <ActionButton label="Mark" onClick={toggleMark} />
          <ActionButton label="Export" onClick={() => console.log('export')} />
        </div>

        {/* notes area */}
        <div className="flex-1 min-h-0 p-3">
          <div className="h-full rounded bg-neutral-50 border border-neutral-100 p-2 text-sm text-neutral-400 italic">
            note input placeholder
          </div>
        </div>

        {/* source badge */}
        <div className="px-3 py-2 border-t border-neutral-100">
          <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
            git
          </div>
          <div className="text-xs text-neutral-600 font-mono truncate mt-0.5">
            {currentFile?.path ?? '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionButton({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded transition-colors"
    >
      {label}
    </button>
  )
}
