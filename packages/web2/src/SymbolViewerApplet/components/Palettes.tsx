import { useMemo } from "react"
import { Box, FileCode2 } from "lucide-react"
import { Badge } from "@paladin/shadcn"
import { usePackages, useProjectSymbols, useTree, type PackageInfo, type ProjectSymbol } from "../api"
import { useWorkspace } from "../store"
import { basename, dirname, relative } from "../lib/paths"
import { collectFiles } from "../lib/tree"
import { Palette } from "./Palette"

export type PaletteMode = "files" | "symbols" | "packages"

export function Palettes({ mode, onClose }: { mode: PaletteMode | null, onClose: () => void }) {
  if (mode === "files") return <FilePalette onClose={onClose} />
  if (mode === "symbols") return <SymbolPalette onClose={onClose} />
  if (mode === "packages") return <PackagePalette onClose={onClose} />
  return null
}

/* cmd+p */
function FilePalette({ onClose }: { onClose: () => void }) {
  const root = useWorkspace((s) => s.root)
  const openFile = useWorkspace((s) => s.openFile)
  const tree = useTree(root)
  const files = useMemo(() => collectFiles(tree.data), [tree.data])
  const rel = (p: string) => (root ? relative(root, p) : p)

  return (
    <Palette
      title="Browse files"
      placeholder="Go to file…"
      items={files}
      loading={tree.isLoading}
      getKey={(f) => f.path}
      getText={(f) => rel(f.path)}
      onSelect={(f) => openFile(f.path)}
      onClose={onClose}
      render={(f) => (
        <>
          <FileCode2 className="opacity-60" />
          <span className="font-mono text-sm">{f.name}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">{rel(dirname(f.path))}</span>
        </>
      )}
    />
  )
}

/* cmd+shift+p: opens the parent file and scrolls to the symbol */
function SymbolPalette({ onClose }: { onClose: () => void }) {
  const root = useWorkspace((s) => s.root)
  const openFile = useWorkspace((s) => s.openFile)
  const symbols = useProjectSymbols(root)
  const items = useMemo(
    () => [...(symbols.data ?? [])].sort((a, b) => Number(b.exported) - Number(a.exported)),
    [symbols.data],
  )
  const rel = (p: string) => (root ? relative(root, p) : p)

  return (
    <Palette<ProjectSymbol>
      title="Browse symbols"
      placeholder="Go to symbol…"
      items={items}
      loading={symbols.isLoading}
      getKey={(s) => `${s.file}#${s.name}`}
      getText={(s) => s.name}
      onSelect={(s) => openFile(s.file, s.name)}
      onClose={onClose}
      render={(s) => (
        <>
          <Badge variant="secondary" className="w-16 justify-center rounded-sm font-mono text-[10px]">
            {s.kind}
          </Badge>
          <span className="font-mono text-sm">{s.name}</span>
          {!s.exported && <span className="text-[10px] text-muted-foreground">local</span>}
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
            {rel(s.file)}:{s.line}
          </span>
        </>
      )}
    />
  )
}

/* cmd+l: packages touched within the past month */
function PackagePalette({ onClose }: { onClose: () => void }) {
  const current = useWorkspace((s) => s.root)
  const setRoot = useWorkspace((s) => s.setRoot)
  const packages = usePackages()

  return (
    <Palette<PackageInfo>
      title="Load package"
      placeholder="Load package touched in the past month…"
      items={packages.data ?? []}
      loading={packages.isFetching && !packages.data}
      getKey={(p) => p.root}
      getText={(p) => `${p.project}/${p.name}`}
      onSelect={(p) => setRoot(p.root)}
      onClose={onClose}
      render={(p) => (
        <>
          <Box className="opacity-60" />
          <span className="font-mono text-sm">
            <span className="text-muted-foreground">{p.project}/</span>
            {p.name}
          </span>
          {p.root === current && <Badge variant="outline" className="text-[10px]">open</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">{ago(p.mtime)}</span>
        </>
      )}
    />
  )
}

export function packageLabel(root: string | null) {
  if (!root) return null
  return `${basename(dirname(dirname(root)))}/${basename(root)}`
}

function ago(ms: number) {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
