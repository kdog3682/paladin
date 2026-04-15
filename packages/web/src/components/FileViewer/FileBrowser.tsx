// src/components/FileViewer/FileBrowser.tsx

import { useMemo } from 'react'
import { cn } from '@bklearn/shadcn'
import { GitBranch, Folder, Layers } from 'lucide-react'
import { useFileViewerStore, type FileSource } from './store'
import {
  ExpandedFileTree,
  type FileTreeEntry,
} from '@/components/ui/ExpandedFileTree'

const SOURCE_ICONS: Record<FileSource['type'], React.ReactNode> = {
  git: <GitBranch size={12} />,
  directory: <Folder size={12} />,
  filegroup: <Layers size={12} />,
}

export function FileBrowser() {
  const source = useFileViewerStore(s => s.source)
  const files = useFileViewerStore(s => s.files)
  const currentFile = useFileViewerStore(s => s.currentFile())
  const setIndexByPath = useFileViewerStore(s => s.setIndexByPath)

  const entries: FileTreeEntry[] = useMemo(
    () => files.map(f => ({ path: f.path })),
    [files],
  )

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* source section */}
      <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-neutral-200/80">
        <span className="text-neutral-400">
          {SOURCE_ICONS[source.type]}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-neutral-700 font-bold">
          {source.name}
        </span>
        <span className="text-[10px] text-neutral-400">
          ({files.length})
        </span>
      </div>

      {/* file tree */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ExpandedFileTree
          entries={entries}
          selectedPath={currentFile?.path ?? null}
          onSelect={setIndexByPath}
        />
      </div>
    </div>
  )
}
