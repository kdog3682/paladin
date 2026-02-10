// @paladin/web/src/components/StagingEntry.tsx

import { useStore } from "../store"
import { Plus, X, GitCommit, Undo2, Loader2, Circle } from "lucide-react"
import type { GitStatusEntry } from "@paladin/types"

interface StagingEntryProps {
  entry: GitStatusEntry
  isSelected: boolean
  onSelect: () => void
  isRecentlyUpdated: boolean
  variant: "staged" | "modified" | "untracked"
}

export function StagingEntry({
  entry,
  isSelected,
  onSelect,
  isRecentlyUpdated,
  variant,
}: StagingEntryProps) {
  const stageFile = useStore((s) => s.stageFile)
  const unstageFile = useStore((s) => s.unstageFile)
  const discardFile = useStore((s) => s.discardFile)
  const commitFile = useStore((s) => s.commitFile)
  const committingFiles = useStore((s) => s.committingFiles)
  const artifacts = useStore((s) => s.artifacts)

  const isCommitting = committingFiles.has(entry.path)

  const artifactId = (() => {
    for (const [id, a] of artifacts) {
      if (a.path?.endsWith(entry.path) || a.aliasedPath?.endsWith(entry.path)) {
        return id
      }
    }
    return null
  })()

  return (
    <div
      className={`
        group flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors
        ${isSelected ? "bg-accent" : "hover:bg-accent/50"}
      `}
      onClick={onSelect}
    >
      <span className="text-muted-foreground">•</span>

      <span className="flex-1 text-sm font-mono text-foreground truncate">
        {entry.relativePath}
      </span>

      {isRecentlyUpdated && (
        <Circle className="w-2 h-2 fill-primary text-primary shrink-0" />
      )}

      <div className="flex items-center gap-0.5">
        {variant === "staged" && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              unstageFile(entry.path)
            }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity"
            title="Unstage"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}

        {(variant === "modified" || variant === "untracked") && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                stageFile(entry.path)
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity"
              title="Stage"
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {artifactId && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  discardFile(artifactId)
                }}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-opacity"
                title="Discard"
              >
                <Undo2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            )}
          </>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation()
            if (artifactId) commitFile(artifactId)
          }}
          disabled={isCommitting || !artifactId}
          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity disabled:opacity-40"
          title="Commit"
        >
          {isCommitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : (
            <GitCommit className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  )
}
