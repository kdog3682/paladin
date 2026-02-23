// @paladin/web/src/views/StagingView.tsx

import { useState, useMemo } from "react"
import { Button } from "../components/ui/button"
import { ScrollArea } from "../components/ui/scroll-area"
import { useStore } from "../stores/app"
import { StagingSection } from "../components/StagingSection"
import { Code, GitCommit, Loader2 } from "lucide-react"
import type { GitStatusEntry } from "@paladin/types"

export function StagingView() {
  const gitEntries = useStore((s) => s.gitEntries)
  const artifacts = useStore((s) => s.artifacts)
  const committingFiles = useStore((s) => s.committingFiles)
  const commitAll = useStore((s) => s.commitAll)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const isCommittingAll = committingFiles.size > 0

  const sections = useMemo(() => {
    const staged: GitStatusEntry[] = []
    const modified: GitStatusEntry[] = []
    const untracked: GitStatusEntry[] = []

    for (const entry of gitEntries) {
      switch (entry.status) {
        case "staged":
          staged.push(entry)
          break
        case "modified":
          modified.push(entry)
          break
        case "untracked":
          untracked.push(entry)
          break
      }
    }

    return { staged, modified, untracked }
  }, [gitEntries])

  const recentlyUpdatedPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const a of artifacts.values()) {
      if (a.status === "created" || a.status === "modified") {
        if (a.path) paths.add(a.path)
      }
    }
    return paths
  }, [artifacts])

  const selectedArtifact = useMemo(() => {
    if (!selectedPath) return null
    for (const a of artifacts.values()) {
      if (a.path?.endsWith(selectedPath) || a.aliasedPath?.endsWith(selectedPath)) {
        return a
      }
    }
    return null
  }, [selectedPath, artifacts])

  return (
    <div className="flex-1 flex">
      <div className="w-1/2 flex flex-col border-r border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">Changes</span>
          <Button
            size="sm"
            variant="outline"
            disabled={gitEntries.length === 0 || isCommittingAll}
            onClick={commitAll}
            className="gap-2"
          >
            {isCommittingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GitCommit className="w-3.5 h-3.5" />
            )}
            Commit All
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            <StagingSection
              title="STAGED"
              entries={sections.staged}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              recentlyUpdated={recentlyUpdatedPaths}
              variant="staged"
            />
            <StagingSection
              title="MODIFIED"
              entries={sections.modified}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              recentlyUpdated={recentlyUpdatedPaths}
              variant="modified"
            />
            <StagingSection
              title="UNTRACKED"
              entries={sections.untracked}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              recentlyUpdated={recentlyUpdatedPaths}
              variant="untracked"
            />

            {gitEntries.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Working tree clean
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="w-1/2 flex flex-col bg-background">
        {selectedArtifact ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Code className="w-4 h-4 text-primary" />
              <span className="text-sm font-mono text-foreground">
                {selectedArtifact.aliasedPath ?? selectedArtifact.path}
              </span>
            </div>
            <ScrollArea className="flex-1">
              <pre className="p-4 text-sm font-mono text-foreground/80 whitespace-pre-wrap">
                {selectedArtifact.content}
              </pre>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Code className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Select a file to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
