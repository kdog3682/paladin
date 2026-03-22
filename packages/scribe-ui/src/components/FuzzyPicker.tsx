// @paladin/scribe-ui/src/components/FuzzyPicker.tsx

import { useState, useEffect, useRef, useCallback } from "react"
import { useStore } from "../store"
import * as api from "../api"
import type { ScoredResult, FileEntry, FileGroup, SourceDir } from "../types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@bklearn/shadcn"
import { Input } from "@bklearn/shadcn"
import { Button } from "@bklearn/shadcn"
import { Badge } from "@bklearn/shadcn"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bklearn/shadcn"
import {
  Folder,
  FileCode,
  Package,
  FolderOpen,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Check,
} from "lucide-react"
import { toast } from "sonner"

const KIND_ICONS: Record<string, typeof FileCode> = {
  group: Package,
  package: Package,
  directory: Folder,
  file: FileCode,
}

export function FuzzyPicker() {
  const {
    setPickerOpen,
    addFilesToTree,
    sourceDirs,
    globalFilters,
    loadSourceDirs,
    loadGlobalFilters,
  } = useStore()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ScoredResult[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const [tab, setTab] = useState<string>("search")
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Auto-focus input on mount and tab switch back to search
  useEffect(() => {
    if (tab === "search") {
      // Small delay to ensure the input is rendered after tab switch
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [tab])

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      const data = await api.files.search(query)
      setResults(data)
      setSelectedIdx(0)
    }, 150)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const pickItem = useCallback(
    (item: ScoredResult) => {
      const entry = item.item
      if (item.kind === "group") {
        const fg = entry as FileGroup
        const entries: FileEntry[] = fg.files.map((f) => ({
          path: f,
          name: f.split("/").pop() || f,
          type: "file" as const,
        }))
        addFilesToTree(entries, "picked")
        setPicked((prev) => [...prev, fg.name])
      } else {
        addFilesToTree([entry as FileEntry], "picked")
        setPicked((prev) => [...prev, (entry as FileEntry).path])
      }
    },
    [addFilesToTree]
  )

  const handleClose = () => setPickerOpen(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose()
      return
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleClose()
      return
    }
    if (e.key === "Enter" && results[selectedIdx]) {
      pickItem(results[selectedIdx])
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
  }

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] flex flex-col"
        onKeyDown={tab === "search" ? handleKeyDown : undefined}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>File Picker</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="search" className="flex-1">Search</TabsTrigger>
            <TabsTrigger value="config" className="flex-1">Source Dirs</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="flex-1 flex flex-col min-h-0 mt-3 gap-3">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files, directories, groups…"
              autoFocus
            />
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {picked.map((p, i) => (
                  <Badge key={`${p}-${i}`} variant="secondary" className="text-xs">
                    <Check className="h-2.5 w-2.5 mr-1" />
                    {p.split("/").pop()}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto border rounded-md">
              {results.length === 0 && query && (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No results
                </div>
              )}
              {results.map((r, i) => {
                const Icon = KIND_ICONS[r.kind] ?? FileCode
                const name = "name" in r.item ? r.item.name : ""
                const subtext =
                  "path" in r.item ? (r.item as FileEntry).path : `${(r.item as FileGroup).files.length} files`
                const id = "path" in r.item ? (r.item as FileEntry).path : (r.item as FileGroup).id
                const isPicked = picked.includes(id) || picked.includes(name)

                return (
                  <div
                    key={`${r.kind}-${name}-${i}`}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${
                      i === selectedIdx ? "bg-accent" : "hover:bg-accent/50"
                    } ${isPicked ? "opacity-50" : ""}`}
                    onClick={() => pickItem(r)}
                    onMouseEnter={() => setSelectedIdx(i)}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{name}</div>
                      <div className="truncate text-xs text-muted-foreground">{subtext}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {r.kind}
                    </Badge>
                    {isPicked && <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>arrows navigate · enter pick · esc close</span>
              <Button size="sm" variant="outline" onClick={handleClose}>
                Done
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="config" className="flex-1 flex flex-col min-h-0 mt-3">
            <SourceDirConfig
              sourceDirs={sourceDirs}
              globalFilters={globalFilters}
              onReload={() => {
                loadSourceDirs()
                loadGlobalFilters()
              }}
              onClose={handleClose}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function SourceDirConfig({
  sourceDirs,
  globalFilters,
  onReload,
  onClose,
}: {
  sourceDirs: SourceDir[]
  globalFilters: ReturnType<typeof useStore>["globalFilters"]
  onReload: () => void
  onClose: () => void
}) {
  const [newPath, setNewPath] = useState("")
  const [gInclude, setGInclude] = useState(globalFilters?.include ?? "")
  const [gExclude, setGExclude] = useState(globalFilters?.exclude ?? "")
  const [addedPaths, setAddedPaths] = useState<string[]>([])
  const [dirFilters, setDirFilters] = useState<Record<string, { include: string, exclude: string }>>({})

  useEffect(() => {
    if (globalFilters) {
      setGInclude(globalFilters.include)
      setGExclude(globalFilters.exclude)
    }
  }, [globalFilters])

  // Init local dir filter state from sourceDirs
  useEffect(() => {
    const filters: Record<string, { include: string, exclude: string }> = {}
    for (const dir of sourceDirs) {
      filters[dir.id] = { include: dir.include ?? "", exclude: dir.exclude ?? "" }
    }
    setDirFilters(filters)
  }, [sourceDirs])

  const addDir = async () => {
    if (!newPath.trim()) return
    try {
      await api.config.sourceDirs.create({ path: newPath.trim() })
      setAddedPaths((prev) => [...prev, newPath.trim()])
      setNewPath("")
      onReload()
      toast.success(`Added ${newPath.trim()}`)
    } catch (err) {
      toast.error("Failed to add directory", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  const toggleVisibility = async (dir: SourceDir) => {
    await api.config.sourceDirs.update(dir.id, { visible: !dir.visible })
    onReload()
  }

  const removeDir = async (dir: SourceDir) => {
    await api.config.sourceDirs.delete(dir.id)
    onReload()
  }

  const handleSaveAndClose = async () => {
    try {
      for (const dir of sourceDirs) {
        const local = dirFilters[dir.id]
        if (!local) continue
        const includeChanged = (local.include || null) !== (dir.include ?? null)
        const excludeChanged = (local.exclude || null) !== (dir.exclude ?? null)
        if (includeChanged || excludeChanged) {
          await api.config.sourceDirs.update(dir.id, {
            include: local.include || null,
            exclude: local.exclude || null,
          })
        }
      }

      await api.config.globalFilters.update({ include: gInclude, exclude: gExclude })

      onReload()
      toast.success("Config saved")
    } catch (err) {
      toast.error("Failed to save config", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    }
    onClose()
  }

  const updateLocalDirFilter = (dirId: string, field: "include" | "exclude", value: string) => {
    setDirFilters((prev) => ({
      ...prev,
      [dirId]: { ...prev[dirId], [field]: value },
    }))
  }

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto space-y-4">
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Source Directories</h4>
          {sourceDirs.map((dir) => {
            const justAdded = addedPaths.includes(dir.path)
            return (
              <div
                key={dir.id}
                className={`border rounded-md p-3 space-y-2 ${justAdded ? "border-green-500/50 bg-green-500/5" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-mono flex-1 truncate">{dir.path}</span>
                  {justAdded && (
                    <Badge variant="secondary" className="text-[10px] text-green-600">
                      added
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => toggleVisibility(dir)}
                  >
                    {dir.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeDir(dir)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="include regex"
                    value={dirFilters[dir.id]?.include ?? ""}
                    className="text-xs h-7"
                    onChange={(e) => updateLocalDirFilter(dir.id, "include", e.target.value)}
                  />
                  <Input
                    placeholder="exclude regex"
                    value={dirFilters[dir.id]?.exclude ?? ""}
                    className="text-xs h-7"
                    onChange={(e) => updateLocalDirFilter(dir.id, "exclude", e.target.value)}
                  />
                </div>
              </div>
            )
          })}
          <div className="flex gap-2">
            <Input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/path/to/source"
              className="text-sm"
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === "Enter") addDir()
              }}
            />
            <Button size="sm" variant="outline" onClick={addDir}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Global Filters</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Include</label>
              <Input
                value={gInclude}
                onChange={(e) => setGInclude(e.target.value)}
                placeholder="\.tsx?$|\.py$"
                className="text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Exclude</label>
              <Input
                value={gExclude}
                onChange={(e) => setGExclude(e.target.value)}
                placeholder="node_modules|dist"
                className="text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t">
        <Button onClick={handleSaveAndClose}>
          Save and Close
        </Button>
      </div>
    </div>
  )
}
