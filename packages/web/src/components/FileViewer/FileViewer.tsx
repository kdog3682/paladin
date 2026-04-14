// src/components/FileViewer/FileViewer.tsx

import { useMemo, useState } from 'react'
import {
  GitCompare,
  Bookmark,
  Upload,
  MessageSquare,
} from 'lucide-react'
import { useAppletKeybindings } from '@/lib/keybindings'
import { useFileViewerStore } from './store'
import { getBasename } from '@/lib/getDisplayName'
import { IconButton } from '@/components/ui/IconButton'
import { FileBrowser } from './FileBrowser'
import { NoteInputArea } from './NoteInputArea'
import { NoteDisplayModal } from './NoteDisplayModal'

export function FileViewer() {
  const currentFile = useFileViewerStore(s => s.currentFile())
  const nextFile = useFileViewerStore(s => s.nextFile)
  const prevFile = useFileViewerStore(s => s.prevFile)
  const toggleDiff = useFileViewerStore(s => s.toggleDiff)
  const toggleMark = useFileViewerStore(s => s.toggleMark)
  const diffActive = useFileViewerStore(s => s.diffActive)

  const [showNotes, setShowNotes] = useState(false)

  const bindings = useMemo(() => [
    { keys: 'shift+down', label: 'Next file', action: nextFile },
    { keys: 'shift+up', label: 'Previous file', action: prevFile },
    { keys: 'ctrl+e', label: 'Export', action: () => console.log('export') },
    { keys: 'ctrl+o', label: 'Open file', action: () => console.log('open file picker') },
    { keys: 'ctrl+shift+o', label: 'Switch source', action: () => console.log('switch source') },
  ], [nextFile, prevFile])

  useAppletKeybindings('file-viewer', bindings)

  const basename = currentFile ? getBasename(currentFile.path) : '—'

  return (
    <>
      <div className="flex h-full">
        {/* editor pane */}
        <div className="flex-[85] min-w-0 flex flex-col">
          {/* filename header */}
          <div className="px-4 py-2 text-xs font-mono text-neutral-400 border-b border-neutral-100">
            {basename}
          </div>
          {/* editor */}
          <div className="flex-1 min-h-0 bg-white font-mono text-sm text-neutral-700 overflow-auto">
            <div className="flex items-center justify-center h-full text-neutral-300">
              editor
            </div>
          </div>
        </div>

        {/* side panel */}
        <div
          className="flex-[15] min-w-[200px] max-w-[280px] shrink-0 flex flex-col my-3 mr-3 rounded-lg bg-white"
          style={{ boxShadow: '-4px 0 24px -8px rgba(0,0,0,0.06)' }}
        >
          {/* action buttons */}
          <div className="px-3 pt-3 pb-2 border-b border-neutral-100">
            <div className="flex items-center gap-1 flex-wrap">
              <IconButton
                icon={<GitCompare size={15} />}
                label="Diff"
                onClick={toggleDiff}
                active={diffActive}
                size="sm"
              />
              <IconButton
                icon={<Bookmark size={15} />}
                label="Mark"
                onClick={toggleMark}
                active={currentFile?.marked}
                size="sm"
              />
              <IconButton
                icon={<Upload size={15} />}
                label="Export"
                onClick={() => console.log('export')}
                size="sm"
              />
              <IconButton
                icon={<MessageSquare size={15} />}
                label="Notes"
                onClick={() => setShowNotes(true)}
                size="sm"
              />
            </div>
          </div>

          {/* file browser */}
          <div className="px-3 py-2 border-b border-neutral-100">
            <FileBrowser />
          </div>

          {/* note input */}
          <div className="flex-1 min-h-0 p-3">
            <NoteInputArea />
          </div>
        </div>
      </div>

      {showNotes && (
        <NoteDisplayModal onClose={() => setShowNotes(false)} />
      )}
    </>
  )
}
