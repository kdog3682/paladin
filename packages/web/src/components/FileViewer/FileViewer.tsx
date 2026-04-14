// src/components/FileViewer/FileViewer.tsx

import { useMemo } from 'react'
import { cn } from '@bklearn/shadcn'
import {
  GitCompare,
  Bookmark,
  Upload,
  MessageSquare,
  FileText,
} from 'lucide-react'
import { useAppletKeybindings } from '@/lib/keybindings'
import { useFileViewerStore } from './store'
import { getDisplayName } from '@/lib/getDisplayName'
import { IconButton } from '@/components/ui/IconButton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@bklearn/shadcn'

export function FileViewer() {
  const currentFile = useFileViewerStore(s => s.currentFile())
  const files = useFileViewerStore(s => s.files)
  const nextFile = useFileViewerStore(s => s.nextFile)
  const prevFile = useFileViewerStore(s => s.prevFile)
  const toggleDiff = useFileViewerStore(s => s.toggleDiff)
  const toggleMark = useFileViewerStore(s => s.toggleMark)
  const toggleShowNotes = useFileViewerStore(s => s.toggleShowNotes)
  const diffActive = useFileViewerStore(s => s.diffActive)
  const linkedFiles = useFileViewerStore(s => s.linkedFiles)
  const source = useFileViewerStore(s => s.source)
  const showNotes = useFileViewerStore(s => s.showNotes)

  const bindings = useMemo(() => [
    { keys: 'shift+down', label: 'Next file', action: nextFile },
    { keys: 'shift+up', label: 'Previous file', action: prevFile },
    { keys: 'ctrl+e', label: 'Export', action: () => console.log('export') },
    { keys: 'ctrl+o', label: 'Open file', action: () => console.log('open file picker') },
    { keys: 'ctrl+shift+o', label: 'Switch source', action: () => console.log('switch source') },
  ], [nextFile, prevFile])

  useAppletKeybindings('file-viewer', bindings)

  const displayName = currentFile
    ? getDisplayName(currentFile.path, { length: 25 })
    : '—'

  return (
    <div className="flex h-full">
      {/* editor pane - 85% */}
      <div className="flex-1 min-w-0">
        <div className="h-full bg-white font-mono text-sm text-neutral-700 overflow-auto">
          {/* CodeMirror mounts here */}
          <div className="flex items-center justify-center h-full text-neutral-300">
            editor
          </div>
        </div>
      </div>

      {/* side panel - 15% */}
      <div className="w-[15%] min-w-[200px] max-w-[280px] shrink-0 flex flex-col my-3 mr-3 rounded-lg bg-white shadow-[-4px_0_24px_-8px_rgba(0,0,0,0.06)]">
        {/* action buttons - 2 rows */}
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
              onClick={toggleShowNotes}
              active={showNotes}
              size="sm"
            />
          </div>
        </div>

        {/* linked files */}
        <div className="px-3 py-2 border-b border-neutral-100">
          <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium mb-1.5">
            Linked
          </div>
          {linkedFiles.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {linkedFiles.slice(0, 5).map(lf => (
                <button
                  key={lf.path}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded text-xs text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 transition-colors text-left truncate"
                >
                  <FileText size={12} className="shrink-0 text-neutral-300" />
                  <span className="truncate">
                    {getDisplayName(lf.path, { length: 20 })}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-neutral-300 italic py-1">
              no linked files
            </div>
          )}
        </div>

        {/* note area */}
        <div className="flex-1 min-h-0 px-3 py-2">
          {showNotes && currentFile?.notes.length ? (
            <div className="flex flex-col gap-1 mb-2">
              {currentFile.notes.map((note, i) => (
                <div key={i} className="text-xs text-neutral-600 bg-neutral-50 rounded px-2 py-1">
                  {note}
                </div>
              ))}
            </div>
          ) : null}
          <div className="h-full rounded border border-neutral-100 bg-neutral-50 p-2 text-sm text-neutral-400 italic">
            note input
          </div>
        </div>

        {/* source + file */}
        <div className="px-3 py-2 border-t border-neutral-100">
          <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
            @{source} ({files.length} files)
          </div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-xs text-neutral-600 font-mono truncate mt-0.5 cursor-default">
                  {displayName}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs font-mono">
                {currentFile?.path}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}
