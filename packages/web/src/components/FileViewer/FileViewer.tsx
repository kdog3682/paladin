// src/components/FileViewer/FileViewer.tsx

import { useFileViewerStore } from './store'
import { getEditorDisplayName } from '@/lib/getDisplayName'
import { IconButton } from '@/components/ui/IconButton'
import { FileBrowser } from './FileBrowser'
import { NoteInputArea } from './NoteInputArea'
import { NoteDisplayModal } from './NoteDisplayModal'
import { useFileViewerActions } from './useFileViewerActions'

export function FileViewer() {
  const currentFile = useFileViewerStore(s => s.currentFile())
  const noteMode = useFileViewerStore(s => s.noteMode)
  const { actions, showNotes, setShowNotes } = useFileViewerActions()

  const displayPath = currentFile && getEditorDisplayName(currentFile.path)

  return (
    <>
      <div className="flex h-full bg-white">
        {/* editor pane */}
        <div className="flex-[80] min-w-0 flex flex-col">
          <div className="px-4 pt-3 pb-2 text-xs font-mono text-neutral-400">
            {displayPath}
          </div>
          <div className="flex-1 min-h-0 font-mono text-sm text-neutral-700 overflow-auto">
            <div className="flex items-center justify-center h-full text-neutral-300">
              editor
            </div>
          </div>
        </div>

        {/* divider */}
        <div className="w-px bg-neutral-100" />

        {/* side panel */}
        <div className="flex-[20] min-w-[220px] max-w-[300px] shrink-0 flex flex-col">
          {/* action buttons */}
          <div className="px-3 pt-3 pb-2 border-b border-neutral-100">
            <div className="flex items-center gap-1 flex-wrap">
              {actions.map(a => (
                <IconButton
                  key={a.key}
                  icon={<a.icon size={15} />}
                  label={a.label}
                  onClick={a.onClick}
                  active={a.active}
                  size="sm"
                  className={a.className}
                />
              ))}
            </div>
          </div>

          {/* file browser / note input */}
          <div className="flex-1 min-h-0 flex flex-col px-3 py-2">
            {noteMode ? <NoteInputArea /> : <FileBrowser />}
          </div>
        </div>
      </div>

      {showNotes && (
        <NoteDisplayModal onClose={() => setShowNotes(false)} />
      )}
    </>
  )
}
