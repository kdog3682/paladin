import { useEffect, useMemo, useRef } from "react"
import { Eye, EyeOff, Play } from "lucide-react"
import { Button, Skeleton } from "@paladin/shadcn"
import { useFsMutations, useSymbols, type SymbolInfo } from "../api"
import { useWorkspace } from "../store"
import { validateIdentifier } from "../lib/rename"
import { useRestoreFocus, useScrollMemory } from "../lib/restore"
import { dialog } from "./Dialogs"
import { toast } from "./Toasts"
import { SymbolCard } from "./SymbolCard"

export type SymbolPanelProps = {
  /* runs the current file, same as cmd+enter */
  onRun: () => void
}

export function SymbolPanel({ onRun }: SymbolPanelProps) {
  const file = useWorkspace((s) => s.currentFile)
  const selected = useWorkspace((s) => s.selected)
  const scrollTarget = useWorkspace((s) => s.scrollTarget)
  const showHidden = useWorkspace((s) => s.showHidden)
  const flipped = useWorkspace((s) => (file ? s.flipped[file] : undefined))
  useWorkspace((s) => (file ? s.hidden[file] : undefined)) /* re-render when hide flags change */
  const ws = useWorkspace.getState()
  const symbols = useSymbols(file)
  const { renameSymbol } = useFsMutations()
  const cardRefs = useRef(new Map<string, HTMLDivElement>())

  const all = symbols.data ?? []
  const isHidden = (s: SymbolInfo) => (file ? ws.isHidden(file, s.name, s.exported) : false)
  const visible = useMemo(
    () => all.filter((s) => showHidden || s.name === selected || !isHidden(s)),
    [all, showHidden, selected, ws.hidden],
  )
  const hiddenCount = all.filter(isHidden).length

  /* on refresh (or returning to a file) the card list comes back at the same scroll position */
  const scrollRef = useRef<HTMLDivElement>(null)
  const ready = !!file && !!symbols.data
  useScrollMemory({ getEl: () => scrollRef.current, bucket: "scroll", key: file, ready, skipRestore: !!scrollTarget })
  useRestoreFocus("cards", ready, () => (selected ? cardRefs.current.get(selected) : scrollRef.current))

  /* cmd+shift+p lands here: scroll to the symbol and focus it */
  useEffect(() => {
    if (!scrollTarget || !symbols.data) return
    const el = cardRefs.current.get(scrollTarget)
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" })
      el.focus({ preventScroll: true })
    } else {
      toast.warn(`${scrollTarget} not found in this file`)
    }
    ws.clearScrollTarget()
  }, [scrollTarget, symbols.data])

  const moveFrom = (name: string, delta: number) => {
    const i = visible.findIndex((s) => s.name === name)
    const next = visible[i + delta]
    if (next) cardRefs.current.get(next.name)?.focus()
  }

  const rename = async (s: SymbolInfo) => {
    if (!file) return
    const input = await dialog.prompt({ title: `Rename ${s.kind} ${s.name}`, initial: s.name })
    if (input === null || input.trim() === s.name) return
    const newName = input.trim()
    const err = validateIdentifier(newName)
    if (err) return toast.warn(err)
    if (all.some((x) => x.name === newName)) return toast.warn(`${newName} already exists in this file`)
    renameSymbol.mutate({ file, name: s.name, newName })
  }

  if (!file)
    return (
      <Empty>
        Open a file from the tree, or press <K>⌘P</K> to browse files and <K>⌘⇧P</K> to browse symbols.
      </Empty>
    )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {all.length} symbols{hiddenCount > 0 && ` · ${hiddenCount} hidden`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={ws.toggleShowHidden} disabled={hiddenCount === 0}>
            {showHidden ? <EyeOff /> : <Eye />}
            {showHidden ? "Dim hidden" : "Show hidden"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRun}>
            <Play />
            Run <K>⌘↵</K>
          </Button>
        </div>
      </div>

      <div ref={scrollRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
        {symbols.isLoading ? (
          <div className="grid gap-3 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : symbols.isError ? (
          <Empty>Couldn't read symbols: {symbols.error.message}</Empty>
        ) : visible.length === 0 ? (
          <Empty>
            {all.length === 0 ? "No top-level symbols in this file." : "Every symbol here is hidden."}
          </Empty>
        ) : (
          <div className="mx-auto grid max-w-3xl gap-3 p-4">
            {visible.map((s) => (
              <SymbolCard
                key={s.name}
                ref={(el) => {
                  if (el) cardRefs.current.set(s.name, el)
                  else cardRefs.current.delete(s.name)
                }}
                symbol={s}
                flipped={!!flipped?.[s.name]}
                hidden={isHidden(s)}
                selected={s.name === selected}
                onSelect={() => {
                  ws.select(s.name)
                  ws.setFocus("cards")
                }}
                onFlip={() => ws.toggleFlip(file, s.name)}
                onHide={() => ws.toggleHidden(file, s.name, s.exported)}
                onRename={() => rename(s)}
                onMove={(d) => moveFrom(s.name, d)}
              />
            ))}
            <p className="pt-2 text-center text-[11px] text-muted-foreground">
              <K>F</K> flip · <K>H</K> hide · <K>J</K>/<K>K</K> move · right click to rename
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">{children}</div>
}

export function K({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1 py-px font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}
