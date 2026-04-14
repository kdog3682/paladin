// src/components/FileViewer/FileBrowser.tsx

import { useMemo } from 'react'
import { cn } from '@bklearn/shadcn'
import { Folder } from 'lucide-react'
import { useFileViewerStore } from './store'
import { getDisplayName, getDirectory, getBasename } from '@/lib/getDisplayName'

export function FileBrowser() {
  const source = useFileViewerStore(s => s.source)
  const files = useFileViewerStore(s => s.files)
  const currentIndex = useFileViewerStore(s => s.currentIndex)
  const setIndex = useFileViewerStore(s => s.setIndex)
  const currentFile = useFileViewerStore(s => s.currentFile())

  const currentDir = currentFile ? getDirectory(currentFile.path) : ''
  const displayDir = currentDir ? getDisplayName(currentDir, { length: 25 }) : '—'

  const filesInDir = useMemo(() =>
    files
      .map((f, i) => ({ ...f, index: i }))
      .filter(f => getDirectory(f.path) === currentDir),
    [files, currentDir],
  )

  return (
    <div className="flex flex-col min-h-0">
      {/* source */}
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
        @{source}
      </div>

      {/* directory */}
      <button
        className="flex items-center gap-1 mt-1 text-xs text-neutral-500 hover:text-neutral-800 transition-colors text-left"
        onClick={() => console.log('open directory picker')}
      >
        <Folder size={12} className="shrink-0" />
        <span className="truncate font-mono">{displayDir}</span>
      </button>

      {/* files in directory */}
      <div className="mt-1.5 flex flex-col gap-px max-h-[140px] overflow-y-auto">
        {filesInDir.map(f => {
          const isActive = f.index === currentIndex
          return (
            <button
              key={f.path}
              onClick={() => setIndex(f.index)}
              className={cn(
                'text-left text-xs font-mono px-1.5 py-0.5 rounded truncate transition-colors',
                isActive
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100',
              )}
            >
              {getBasename(f.path)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
