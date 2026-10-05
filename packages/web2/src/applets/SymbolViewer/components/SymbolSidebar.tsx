import { useMemo } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Skeleton,
} from "@paladin/shadcn"
import { useSymbolDetail, type Reference } from "../api"
import { useWorkspace } from "../store"
import { relative } from "../lib/paths"

/* right sidebar: types and references for the selected symbol */
export function SymbolSidebar() {
  const root = useWorkspace((s) => s.root)
  const file = useWorkspace((s) => s.currentFile)
  const selected = useWorkspace((s) => s.selected)
  const openFile = useWorkspace((s) => s.openFile)
  const detail = useSymbolDetail(file, selected)

  const refsByFile = useMemo(() => {
    const groups = new Map<string, Reference[]>()
    for (const r of detail.data?.references ?? []) {
      const list = groups.get(r.file) ?? []
      list.push(r)
      groups.set(r.file, list)
    }
    return [...groups.entries()]
  }, [detail.data])

  const rel = (p: string) => (root ? relative(root, p) : p)

  return (
    <Sidebar side="right" collapsible="none" className="hidden h-full border-l lg:flex">
      <SidebarHeader className="border-b">
        <p className="truncate font-mono text-sm font-semibold">{selected ?? "No symbol selected"}</p>
      </SidebarHeader>
      <SidebarContent>
        {!selected ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">Select a card to see its types and references.</p>
        ) : detail.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : detail.isError ? (
          <p className="px-4 py-3 text-xs text-destructive">{detail.error.message}</p>
        ) : (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Types · {detail.data?.types.length ?? 0}</SidebarGroupLabel>
              <SidebarGroupContent className="space-y-2">
                {detail.data?.types.length === 0 && <None />}
                {detail.data?.types.map((t) => (
                  <button
                    key={`${t.file}:${t.name}`}
                    onClick={() => openFile(t.file, t.name)}
                    className="block w-full rounded-md border bg-background p-2 text-left hover:bg-sidebar-accent"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs font-semibold">{t.name}</span>
                      <span className="ml-auto truncate text-[10px] text-muted-foreground">
                        {rel(t.file)}:{t.line}
                      </span>
                    </div>
                    <pre className="mt-1 max-h-40 overflow-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {t.text}
                    </pre>
                  </button>
                ))}
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>References · {detail.data?.references.length ?? 0}</SidebarGroupLabel>
              <SidebarGroupContent>
                {refsByFile.length === 0 && <None />}
                {refsByFile.map(([refFile, refs]) => (
                  <div key={refFile} className="mb-2">
                    <p className="truncate px-2 pb-0.5 font-mono text-[11px] text-muted-foreground">{rel(refFile)}</p>
                    <SidebarMenu className="gap-0">
                      {refs.map((r) => (
                        <SidebarMenuItem key={`${r.line}:${r.text}`}>
                          <SidebarMenuButton
                            size="sm"
                            className="h-auto py-1 font-mono text-[11px]"
                            onClick={() => openFile(r.file, r.symbol ?? null)}
                            title={r.symbol ? `in ${r.symbol}` : undefined}
                          >
                            <span className="w-7 shrink-0 text-right text-muted-foreground">{r.line}</span>
                            <span className="truncate">{r.text.trim()}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </div>
                ))}
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  )
}

function None() {
  return <p className="px-2 text-xs text-muted-foreground">None</p>
}
