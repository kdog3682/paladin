import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ChevronsUpDown } from "lucide-react"
import {
  Separator,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  TooltipProvider,
} from "@paladin/shadcn"
import { useFsMutations, usePackages } from "./api"
import { useWorkspace } from "./store"
import { useGlobalHotkeys } from "./lib/hotkeys"
import { relative } from "./lib/paths"
import { FileTree } from "./components/FileTree"
import { SymbolPanel, K } from "./components/SymbolPanel"
import { SymbolSidebar } from "./components/SymbolSidebar"
import { Palettes, packageLabel, type PaletteMode } from "./components/Palettes"
import { RunOutput, type RunState } from "./components/RunOutput"
import { Dialogs } from "./components/Dialogs"
import { Toasts, toast } from "./components/Toasts"

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Workspace />
        <Dialogs />
        <Toasts />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

function Workspace() {
  const root = useWorkspace((s) => s.root)
  const currentFile = useWorkspace((s) => s.currentFile)
  const sidebarOpen = useWorkspace((s) => s.sidebarOpen)
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen)
  const setRoot = useWorkspace((s) => s.setRoot)
  const packages = usePackages()
  const { runFile } = useFsMutations()
  const [palette, setPalette] = useState<PaletteMode | null>(null)
  const [run, setRun] = useState<RunState | null>(null)

  /* first ever load: open the most recently touched package. after that the persisted one is restored */
  useEffect(() => {
    if (!root && packages.data?.length) setRoot(packages.data[0].root)
  }, [root, packages.data])

  const runCurrent = () => {
    if (!currentFile) return toast.warn("No file open to run")
    const file = currentFile
    setRun({ file, pending: true })
    runFile.mutate(
      { file },
      {
        onSuccess: (result) => setRun({ file, pending: false, result }),
        onError: () => setRun({ file, pending: false }),
      },
    )
  }

  useGlobalHotkeys({
    "mod+p": () => setPalette("files"),
    "mod+shift+p": () => setPalette("symbols"),
    "mod+l": () => setPalette("packages"),
    "mod+enter": runCurrent,
  })

  return (
    <SidebarProvider className="h-svh" open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="border-b">
          <SidebarMenuButton onClick={() => setPalette("packages")} className="h-auto py-1.5">
            <div className="grid min-w-0 flex-1 text-left">
              <span className="truncate font-mono text-sm font-semibold">
                {packageLabel(root) ?? (packages.isLoading ? "Loading…" : "No package")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Switch package <K>⌘L</K>
              </span>
            </div>
            <ChevronsUpDown className="ml-auto opacity-60" />
          </SidebarMenuButton>
        </SidebarHeader>
        <SidebarContent>
          <FileTree />
        </SidebarContent>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="truncate font-mono text-sm">
            {currentFile ? (root ? relative(root, currentFile) : currentFile) : "—"}
          </span>
          <span className="ml-auto hidden items-center gap-3 text-[11px] text-muted-foreground md:flex">
            <span>
              <K>⌘P</K> files
            </span>
            <span>
              <K>⌘⇧P</K> symbols
            </span>
          </span>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <SymbolPanel onRun={runCurrent} />
            </div>
            {run && <RunOutput run={run} onClose={() => setRun(null)} />}
          </main>
          <SymbolSidebar />
        </div>
      </SidebarInset>

      <Palettes mode={palette} onClose={() => setPalette(null)} />
    </SidebarProvider>
  )
}
