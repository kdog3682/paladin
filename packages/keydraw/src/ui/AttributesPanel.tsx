import { useEffect, useMemo, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@paladin/shadcn"
import { useEditor, S } from "../store/useEditor"
import { selectionOf } from "../store/slices/selection"
import { formatToken, formatValue } from "../props/registry"
import { breadcrumb, computeRows, type AttrRow } from "./attrs"
import { effectiveDefaults } from "../store/slices/defaults"
import { useAttrsPanel } from "./attrsPanelState"

type AttributesPanelProps = {
  /* panel width in px, from the Layout defaults */
  width?: number
}

/** Side panel reflecting the focused node, or the selection (§11). */
export function AttributesPanel({ width = 280 }: AttributesPanelProps) {
  const doc = useEditor((s) => s.doc)
  const draft = useEditor((s) => s.draft)
  const globalDefaults = useEditor((s) => s.defaults)
  const defaults = useMemo(() => effectiveDefaults({ defaults: globalDefaults, doc }), [globalDefaults, doc])
  const all = useEditor((s) => s.settings.attrs === "all")
  const focused = useEditor((s) => s.mode === "attrs")
  const lastTouched = useEditor((s) => s.lastTouched)
  const focus = useEditor((s) => s.focus)
  const ids = useEditor(useShallow((s) => selectionOf(s)))
  const { row, editing } = useAttrsPanel()

  const view = draft ?? doc
  const rows = useMemo(() => computeRows({ doc, draft, ids, defaults, all }), [doc, draft, ids, defaults, all])
  const node = view.nodes[focus]
  const crumbs = useMemo(() => breadcrumb(view, focus), [view, focus])

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-l bg-background text-sm"
      style={{ width }}
    >
      <header className="space-y-1 border-b px-3 py-2">
        <div className="truncate text-xs text-muted-foreground">{crumbs.join(" › ")}</div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{node?.kind ?? "—"}</span>
          <span className="truncate font-medium">{node?.name ?? (ids.length > 1 ? "" : "unnamed")}</span>
          {ids.length > 1 && <span className="ml-auto text-xs text-muted-foreground">{ids.length} selected</span>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto py-1">
        {rows.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No configured attributes · <code>:set attrs all</code>
          </p>
        ) : (
          rows.map((r, i) => (
            <Row
              key={r.name}
              row={r}
              active={focused && i === Math.min(row, rows.length - 1)}
              touched={r.name === lastTouched}
              editing={editing === r.name}
            />
          ))
        )}
      </div>

      {focused && (
        <footer className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          ↑↓ rows · Space cycle · Alt-↑↓ nudge · Enter edit · x reset · Esc canvas
        </footer>
      )}
    </aside>
  )
}

type RowProps = {
  row: AttrRow
  /* keyboard cursor is on this row */
  active: boolean
  /* last-touched numeric prop: the nudge target */
  touched: boolean
  editing: boolean
}

function Row({ row, active, touched, editing }: RowProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" })
  }, [active])

  const value = row.mixed ? "mixed" : row.value === undefined ? "—" : formatValue(row.def, row.value)
  const token = row.mixed || row.value === undefined ? "" : formatToken(row.def, row.value)

  return (
    <div
      ref={ref}
      className={cn(
        "grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1",
        row.pending && "bg-amber-500/10",
        touched && "border-l-2 border-primary",
        active && "bg-accent text-accent-foreground",
        row.isDefault && !row.pending && "text-muted-foreground",
      )}
    >
      <span className="truncate">{row.name}</span>
      {editing ? (
        <InlineEdit row={row} initial={row.mixed ? "" : value} />
      ) : (
        <span className={cn("font-mono text-xs", row.mixed && "italic text-muted-foreground")}>{value}</span>
      )}
      <span className="w-14 truncate text-right font-mono text-xs text-muted-foreground">{token}</span>
    </div>
  )
}

/*
 * Inline edit is a typing context (§5). It has data-keydraw-ignore, so the
 * global dispatcher skips it and it handles Enter / Esc / Shift-Backspace / nudge itself.
 * Each keystroke live-previews; Esc reverts with no history entry.
 */
function InlineEdit({ row, initial }: { row: AttrRow; initial: string }) {
  const [text, setText] = useState(initial)
  const [error, setError] = useState(false)
  const close = () => useAttrsPanel.getState().setEditing(null)

  const parse = (raw: string): { ok: true; v: unknown } | { ok: false } => {
    if (!raw.trim()) return { ok: false }
    try {
      const v = row.def.parse(raw.trim())
      return v === undefined ? { ok: false } : { ok: true, v }
    } catch {
      return { ok: false }
    }
  }

  const update = (raw: string) => {
    setText(raw)
    const p = parse(raw)
    setError(!p.ok && raw.trim() !== "")
    S().preview(p.ok ? { type: "setProps", props: { [row.name]: p.v } } : null)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const p = parse(text)
      S().preview(null)
      if (p.ok) S().commit({ type: "setProps", props: { [row.name]: p.v } }, { repeatable: true })
      close()
    } else if (e.key === "Escape") {
      e.preventDefault()
      S().preview(null)
      close()
    } else if (e.key === "Backspace" && e.shiftKey) {
      e.preventDefault()
      update(text.replace(/\s*\S+\s*$/, ""))
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault()
      const d = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)
      update(nudgeText(text, d))
    }
  }

  return (
    <input
      data-keydraw-ignore
      autoFocus
      value={text}
      onChange={(e) => update(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        S().preview(null)
        close()
      }}
      className={cn(
        "w-24 rounded border bg-background px-1 py-0.5 font-mono text-xs outline-none focus:ring-1 focus:ring-ring",
        error && "border-destructive",
      )}
    />
  )
}

/* ±d on the last number in the text ("20p" → "21p"); appends one if there is none. */
function nudgeText(text: string, d: number): string {
  const m = /(-?\d+(?:\.\d+)?)(?!.*\d)/.exec(text)
  if (!m) return text + String(d)
  const n = Number(m[1]) + d
  return text.slice(0, m.index) + String(n) + text.slice(m.index + m[1].length)
}
