// @paladin/web/src/components/StagingSection.tsx

import { useStore } from "@/stores/app"
import { StagingEntry } from "@/components/StagingEntry"
import { Plus, X, GitCommit, Loader2 } from "lucide-react"
import type { GitStatusEntry } from "@paladin/types"

interface StagingSectionProps {
  title: string
  entries: GitStatusEntry[]
  selectedPath: string | null
  onSelect: (path: string) => void
  recentlyUpdated: Set<string>
  variant: "staged" | "modified" | "untracked"
}

export function StagingSection({
  title,
  entries,
  selectedPath,
  onSelect,
  recentlyUpdated,
  variant,
}: StagingSectionProps) {
  const stageFiles = useStore((s) => s.stageFiles)
  const unstageAll = useStore((s) => s.unstageAll)
  const commitFiles = useStore((s) => s.commitFiles)
  const committingFiles = useStore((s) => s.committingFiles)

  const paths = entries.map((e) => e.path)
  const isCommitting = paths.some((p) => committingFiles.has(p))

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground uppercase tracking-wide">
            {title}
          </span>
          <span className="text-xs text-muted-foreground">{entries.length}</span>
        </div>

        <div className="flex items-center gap-1">
          {variant === "staged" && entries.length > 0 && (
            <>
              <button
                onClick={() => unstageAll()}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Unstage all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => commitFiles(paths)}
                disabled={isCommitting}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                title="Commit staged"
              >
                {isCommitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <GitCommit className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}
          {(variant === "modified" || variant === "untracked") && entries.length > 0 && (
            <>
              <button
                onClick={() => stageFiles(paths)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Stage all"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => commitFiles(paths)}
                disabled={isCommitting}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                title="Commit all"
              >
                {isCommitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <GitCommit className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-0.5">
        {entries.map((entry) => (
          <StagingEntry
            key={entry.path}
            entry={entry}
            isSelected={selectedPath === entry.path}
            onSelect={() => onSelect(entry.path)}
            isRecentlyUpdated={recentlyUpdated.has(entry.path)}
            variant={variant}
          />
        ))}
      </div>
    </div>
  )
}
