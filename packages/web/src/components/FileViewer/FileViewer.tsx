// src/components/FileViewer/FileViewer.tsx

import { useMemo, useState, useCallback } from 'react'
import { cn } from '@bklearn/shadcn'
import {
  GitCompare,
  Bookmark,
  Upload,
  MessageSquare,
  Trash2,
  Save,
  Plus,
  FileSearch,
} from 'lucide-react'
import { useAppletKeybindings } from '@/lib/keybindings'
import { useFileViewerStore } from './store'
import { getEditorDisplayName } from '@/lib/getDisplayName'
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
  const clearNotes = useFileViewerStore(s => s.clearNotes)
  const diffActive = useFileViewerStore(s => s.diffActive)
  const noteMode = useFileViewerStore(s => s.noteMode)
  const setNoteMode = useFileViewerStore(s => s.setNoteMode)

  const [showNotes, setShowNotes] = useState(false)
  const [exportFlash, setExportFlash] = useState(false)

  const handleExport = useCallback(() => {
    // build payload and copy
    const files = useFileViewerStore.getState().files
    const marked = files.filter(f => f.marked)
    const payload = marked
      .map(f => `// ${getEditorDisplayName(f.path)}\n(file content placeholder)`)
      .join('\n\n')
    const notes = marked
      .filter(f => f.notes.length > 0)
      .map(f => `${getEditorDisplayName(f.path)}\n${f.notes.map(n => `  - ${n}`).join('\n')}`)
      .join('\n\n')

    const full = payload + (notes ? '\n\n---\n\n' + notes : '')

    try {
      const ta = document.createElement('textarea')
      ta.value = full
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch {}

    // flash animation
    setExportFlash(true)
    setTimeout(() => setExportFlash(false), 600)
  }, [])

  const handleSave = useCallback(() => {
    console.log('save ticket')
  }, [])

  const handleNew = useCallback(() => {
    console.log('new ticket - open source picker')
  }, [])

  const handleReview = useCallback(() => {
    console.log('open review in text editor applet')
  }, [])

  const bindings = useMemo(() => [
    { keys: 'shift+down', label: 'Next file', action: nextFile },
    { keys: 'shift+up', label: 'Previous file', action: prevFile },
    { keys: 'ctrl+e', label: 'Export', action: handleExport },
    { keys: 'ctrl+s', label: 'Save ticket', action: handleSave },
    { keys: 'ctrl+n', label: 'New ticket', action: handleNew },
    { keys: 'ctrl+o', label: 'Open file', action: () => console.log('open file picker') },
    { keys: 'ctrl+shift+o', label: 'Add from git', action: () => console.log('add from git') },
  ], [nextFile, prevFile, handleExport, handleSave, handleNew])

  useAppletKeybindings('file-viewer', bindings)

  const displayPath = currentFile
    ? getEditorDisplayName(currentFile.path)
    : '—'

  return (
    <>
      <div className="flex h-full bg-white">
        {/* editor pane */}
        <div className="flex-[80] min-w-0 flex flex-col">
          {/* filename header — aligned with side panel buttons */}
          <div className="px-4 pt-3 pb-2 text-xs font-mono text-neutral-400">
            {displayPath}
          </div>
          {/* editor */}
          <div className="flex-1 min-h-0 font-mono text-sm text-neutral-700 overflow-auto">
            <div className="flex items-center justify-center h-full text-neutral-300">
              editor
            </div>
          </div>
        </div>

        {/* solid divider */}
        <div className="w-px bg-neutral-100" />

        {/* side panel */}
        <div className="flex-[20] min-w-[220px] max-w-[300px] shrink-0 flex flex-col">
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
                onClick={handleExport}
                active={exportFlash}
                size="sm"
                className={cn(exportFlash && 'animate-pulse')}
              />
              <IconButton
                icon={<MessageSquare size={15} />}
                label="Notes"
                onClick={() => setShowNotes(true)}
                size="sm"
              />
              <IconButton
                icon={<Save size={15} />}
                label="Save"
                onClick={handleSave}
                size="sm"
              />
              <IconButton
                icon={<Trash2 size={15} />}
                label="Clear notes"
                onClick={clearNotes}
                size="sm"
              />
              <IconButton
                icon={<FileSearch size={15} />}
                label="Review"
                onClick={handleReview}
                size="sm"
              />
              <IconButton
                icon={<Plus size={15} />}
                label="New ticket"
                onClick={handleNew}
                size="sm"
              />
            </div>
          </div>

          {/* file browser / note input — toggle */}
          <div className="flex-1 min-h-0 flex flex-col relative">
            {/* file browser layer */}
            <div
              className={cn(
                'absolute inset-0 flex flex-col px-3 py-2 transition-opacity',
                noteMode ? 'opacity-0 pointer-events-none' : 'opacity-100',
              )}
            >
              <FileBrowser />
            </div>

            {/* note layer */}
            <div
              className={cn(
                'absolute inset-0 flex flex-col px-3 py-2 transition-opacity',
                noteMode ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <NoteInputArea />
            </div>
          </div>
        </div>
      </div>

      {showNotes && (
        <NoteDisplayModal onClose={() => setShowNotes(false)} />
      )}
    </>
  )
}
