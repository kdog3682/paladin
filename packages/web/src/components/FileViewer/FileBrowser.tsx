// src/components/FileViewer/FileBrowser.tsx

import { useMemo } from 'react'
import { cn } from '@bklearn/shadcn'
import { FileText } from 'lucide-react'
import { useFileViewerStore } from './store'
import {
  getDisplayName,
  getDirectory,
  getBasename,
  getSourceLabel,
} from '@/lib/getDisplayName'

export function FileBrowser() {
  const source = useFileViewerStore(s => s.source)
  const files = useFileViewerStore(s => s.files)
  const currentIndex = useFileViewerStore(s => s.currentIndex)
  const setIndex = useFileViewerStore(s => s.setIndex)
  const currentFile = useFileViewerStore(s => s.currentFile())

  const currentDir = currentFile ? getDirectory(currentFile.path) : ''
  const displayDir = currentDir ? getDisplayName(currentDir, { length: 25 }) : '—'

  const sourceLabel = useMemo(
    () => getSourceLabel(source, files.map(f => f.path)),
    [source, files],
  )

  const filesInDir = useMemo(() =>
    files
      .map((f, i) => ({ ...f, index: i }))
      .filter(f => getDirectory(f.path) === currentDir),
    [files, currentDir],
  )

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* source section */}
      <div className="pb-2 mb-2 border-b border-dashed border-neutral-200/80">
        <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
          {sourceLabel} ({files.length} files)
        </div>
      </div>

      {/* directory */}
      <button
        className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium text-left hover:text-neutral-600 transition-colors mb-1.5"
        onClick={() => console.log('open directory picker')}
      >
        {displayDir}
      </button>

      {/* files in directory */}
      <div className="flex flex-col gap-px overflow-y-auto flex-1">
        {filesInDir.map(f => {
          const isActive = f.index === currentIndex
          return (
            <button
              key={f.path}
              onClick={() => setIndex(f.index)}
              className={cn(
                'flex items-center gap-1.5 text-left text-xs font-mono px-1.5 py-1 rounded truncate transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50',
              )}
            >
              <FileText size={12} className="shrink-0 opacity-40" />
              <span className="truncate">{getBasename(f.path)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
