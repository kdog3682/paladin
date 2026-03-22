// @paladin/scribe-ui/src/components/FileViewer.tsx

import { useEffect, useMemo } from "react"
import { useStore } from "../store"
import { useKeyBindings } from "../keybindings"
import { Button } from "@bklearn/shadcn"
import { Maximize2, Minimize2 } from "lucide-react"

const LINES_PER_PAGE = 40

function SourceCodeViewer({ filename, content }: { filename: string, content: string }) {
  const lines = content.split("\n")

  return (
    <div className="border-b last:border-b-0">
      <div className="sticky top-0 bg-muted/80 backdrop-blur px-4 py-1.5 text-xs font-mono text-muted-foreground border-b">
        {filename}
      </div>
      <pre className="px-4 py-2 text-xs font-mono leading-5 overflow-x-auto">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="text-muted-foreground w-10 flex-shrink-0 text-right pr-3 select-none">
              {i + 1}
            </span>
            <span>{line}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}

export function FileViewer({ fullscreen }: { fullscreen: boolean }) {
  const {
    sourceFiles,
    fileContents,
    viewerFileIndex,
    viewerScrollLine,
    readFile,
    setViewerFileIndex,
    setViewerScrollLine,
    setViewerFullscreen,
    togglePin,
  } = useStore()

  // Load content for all bookmarked files
  useEffect(() => {
    for (const path of sourceFiles) {
      if (!fileContents[path]) {
        readFile(path)
      }
    }
  }, [sourceFiles])

  const currentFile = sourceFiles[viewerFileIndex]
  const currentContent = currentFile ? fileContents[currentFile] : undefined
  const currentLines = currentContent?.split("\n") ?? []
  const totalLines = currentLines.length

  useKeyBindings(
    "fileviewer",
    [
      {
        key: "]",
        description: "Scroll down",
        handler: () => {
          const nextLine = viewerScrollLine + LINES_PER_PAGE
          if (nextLine >= totalLines && viewerFileIndex < sourceFiles.length - 1) {
            setViewerFileIndex(viewerFileIndex + 1)
          } else {
            setViewerScrollLine(Math.min(nextLine, Math.max(0, totalLines - LINES_PER_PAGE)))
          }
        },
      },
      {
        key: "[",
        description: "Scroll up",
        handler: () => {
          setViewerScrollLine(Math.max(0, viewerScrollLine - LINES_PER_PAGE))
        },
      },
      {
        key: "ArrowRight",
        shift: true,
        description: "Next file",
        handler: () => {
          if (viewerFileIndex < sourceFiles.length - 1) {
            setViewerFileIndex(viewerFileIndex + 1)
          }
        },
      },
      {
        key: "ArrowLeft",
        shift: true,
        description: "Previous file",
        handler: () => {
          if (viewerFileIndex > 0) {
            setViewerFileIndex(viewerFileIndex - 1)
          }
        },
      },
      {
        key: "p",
        description: "Pin current file",
        handler: () => {
          if (currentFile) togglePin(currentFile)
        },
      },
    ],
    [viewerFileIndex, viewerScrollLine, totalLines, sourceFiles, currentFile]
  )

  if (sourceFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No bookmarked files to display
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {viewerFileIndex + 1} / {sourceFiles.length}
          </span>
          {currentFile && (
            <span className="font-mono truncate max-w-64">
              {currentFile.split("/").pop()}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setViewerFullscreen(!fullscreen)}
        >
          {fullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {fullscreen ? (
          // Fullscreen: show all files
          sourceFiles.map((path) => (
            <SourceCodeViewer
              key={path}
              filename={path.split("/").pop() || path}
              content={fileContents[path] ?? "Loading…"}
            />
          ))
        ) : (
          // Normal: show current file with scroll offset
          currentFile && (
            <SourceCodeViewer
              filename={currentFile.split("/").pop() || currentFile}
              content={
                currentContent
                  ? currentLines.slice(viewerScrollLine).join("\n")
                  : "Loading…"
              }
            />
          )
        )}
      </div>
    </div>
  )
}
