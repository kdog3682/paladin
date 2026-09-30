import { forwardRef } from "react"
import { EyeOff } from "lucide-react"
import {
  Badge,
  Card,
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@paladin/shadcn"
import type { SymbolInfo, SymbolKind } from "../api"
import { InlineRename, type InlineRenameProps } from "./InlineRename"

export type SymbolCardProps = {
  symbol: SymbolInfo
  flipped: boolean
  hidden: boolean
  selected: boolean
  onSelect: () => void
  onFlip: () => void
  onHide: () => void
  /* starts an inline rename */
  onRename: () => void
  /* the name is being edited in place */
  renaming: boolean
  /* return false to keep editing */
  onRenameSubmit: (newName: string) => boolean | void
  onRenameCancel: () => void
  /* arrow / j k navigation between cards */
  onMove: (delta: number) => void
}

const KIND_STYLE: Record<SymbolKind, string> = {
  function: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  class: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  interface: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  type: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  variable: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  enum: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
}

const face = "col-start-1 row-start-1 [backface-visibility:hidden] flex flex-col gap-2 p-4 min-w-0"

export const SymbolCard = forwardRef<HTMLDivElement, SymbolCardProps>(function SymbolCard(
  { symbol, flipped, hidden, selected, onSelect, onFlip, onHide, onRename, renaming, onRenameSubmit, onRenameCancel, onMove },
  ref,
) {
  const rename = renaming ? { initial: symbol.name, onSubmit: onRenameSubmit, onCancel: onRenameCancel } : null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || renaming || e.target !== e.currentTarget) return
    const k = e.key.toLowerCase()
    if (k === "f") onFlip()
    else if (k === "h") onHide()
    else if (k === "f2") onRename()
    else if (k === "arrowdown" || k === "j") onMove(1)
    else if (k === "arrowup" || k === "k") onMove(-1)
    else return
    e.preventDefault()
  }

  return (
    <ContextMenu>
      {/* base ui: the trigger renders its own wrapper div (no asChild) */}
      <ContextMenuTrigger className="block rounded-xl">
        <div
          ref={ref}
          data-symbol={symbol.name}
          tabIndex={0}
          onFocus={onSelect}
          onKeyDown={onKeyDown}
          className="rounded-xl outline-none [perspective:1600px]"
        >
          <Card
            className={cn(
              "grid gap-0 py-0 transition-[transform,opacity,box-shadow] duration-300 [transform-style:preserve-3d]",
              flipped && "[transform:rotateY(180deg)]",
              selected && "ring-2 ring-ring",
              hidden && "opacity-50",
            )}
          >
            <div className={face} aria-hidden={flipped}>
              <Header symbol={symbol} hidden={hidden} rename={flipped ? null : rename} />
              {symbol.docs && (
                <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{symbol.docs}</p>
              )}
              <pre className="overflow-x-auto rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs leading-relaxed">
                {symbol.signature}
              </pre>
              {symbol.methods && symbol.methods.length > 0 && (
                <ul className="space-y-1 border-l pl-3">
                  {symbol.methods.map((m) => (
                    <li key={m.name} className="min-w-0">
                      <code className="block truncate font-mono text-xs" title={m.signature}>
                        {m.signature}
                      </code>
                      {m.docs && <p className="truncate text-xs text-muted-foreground">{m.docs}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={cn(face, "[transform:rotateY(180deg)]")} aria-hidden={!flipped}>
              <Header symbol={symbol} hidden={hidden} rename={flipped ? rename : null} />
              <pre className="max-h-[28rem] overflow-auto rounded-md bg-muted px-2.5 py-2 font-mono text-xs leading-relaxed">
                {symbol.text}
              </pre>
            </div>
          </Card>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={onRename}>Rename symbol…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onFlip}>{flipped ? "Show summary" : "Show source"} <Kbd>F</Kbd></ContextMenuItem>
        <ContextMenuItem onClick={onHide}>{hidden ? "Unhide" : "Hide"} <Kbd>H</Kbd></ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

type HeaderProps = {
  symbol: SymbolInfo
  hidden: boolean
  /* present while the name is being edited */
  rename: InlineRenameProps | null
}

function Header({ symbol, hidden, rename }: HeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className={cn("rounded-sm px-1.5 font-mono text-[10px]", KIND_STYLE[symbol.kind])}>
        {symbol.kind}
      </Badge>
      {rename ? (
        <InlineRename {...rename} className="h-7 max-w-64 text-sm font-semibold" />
      ) : (
        <span className="truncate font-mono text-sm font-semibold">{symbol.name}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        {hidden && <EyeOff className="size-3" />}
        {symbol.exported ? "export" : "local"} · L{symbol.line}
      </span>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto font-mono text-[10px] text-muted-foreground">{children}</span>
}
