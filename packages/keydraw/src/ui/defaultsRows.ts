/*
 * Rows of the defaults modal (§13). Pure over the defaults and the artboard overrides;
 * writes go through applyRow / resetRow, which update the store.
 */
import { nudgeValue } from "../input-mode/nudge"
import { tokenize } from "../input-mode/tokenize"
import { PROPS, cycleValues, formatToken, formatValue, isNumeric, isToggleable, type PropDef } from "../props/registry"
import { builtinDefaults, type Defaults, type NodeDefaultKey } from "../store/slices/defaults"
import type { Doc, Props } from "../model/types"
import { S } from "../store/useEditor"

export type RowKind = "prop" | "number" | "bool" | "enum" | "text"

export type DRow = {
  section: number
  /* unique within the section; the prop name for node sections */
  key: string
  label: string
  kind: RowKind
  def?: PropDef
  values?: string[]
  min?: number
}

type NodeSection = { id: NodeDefaultKey, title: string, node: true }
type OtherSection = { id: "placement" | "shadows" | "export" | "editor" | "layout", title: string, node?: false }
export const SECTIONS: (NodeSection | OtherSection)[] = [
  { id: "rect", title: "Rect", node: true },
  { id: "ellipse", title: "Ellipse", node: true },
  { id: "text", title: "Text", node: true },
  { id: "icon", title: "Icon", node: true },
  { id: "frame", title: "Frame", node: true },
  { id: "artboard", title: "Artboard", node: true },
  { id: "placement", title: "Placement" },
  { id: "shadows", title: "Shadow presets" },
  { id: "export", title: "Export" },
  { id: "editor", title: "Editor" },
  { id: "layout", title: "Layout" },
]

export const isNodeSection = (i: number) => !!SECTIONS[i]?.node

const num = (section: number, key: string, label: string, min = 0): DRow => ({ section, key, label, kind: "number", min })
const bool = (section: number, key: string, label: string): DRow => ({ section, key, label, kind: "bool" })

/* props of a node section as the modal shows them: global values with the artboard's overrides on top */
export function nodeProps(d: Defaults, id: NodeDefaultKey, overrides: Doc["boards"][string]["overrides"], scope: "global" | "board"): Props {
  return scope === "board" ? { ...d.nodes[id], ...overrides?.[id] } : d.nodes[id]
}

export function sectionRows(d: Defaults, section: number, props: Props = {}): DRow[] {
  const s = SECTIONS[section]
  switch (s.id) {
    case "placement":
      return [{ section, key: "place", label: "place", kind: "enum", values: ["right", "below"] }, num(section, "gap", "gap")]
    case "shadows":
      return Object.keys(d.shadows).map(k => ({ section, key: k, label: k, kind: "text" as const }))
    case "export":
      return [num(section, "scale", "scale", 1), bool(section, "background", "background")]
    case "editor":
      return [
        num(section, "gridSize", "grid size", 1),
        num(section, "zoomStep", "zoom step"),
        num(section, "historyDepth", "history depth", 1),
        num(section, "whichKeyDelay", "which-key delay"),
        num(section, "timeoutLen", "key timeout"),
      ]
    case "layout":
      return [
        bool(section, "statusLine", "status line"),
        bool(section, "tokenLine", "token line"),
        bool(section, "attributesPanel", "attributes panel"),
        num(section, "attributesWidth", "attributes width", 120),
        bool(section, "layerTree", "layer tree"),
      ]
    default:
      return PROPS.filter(def => props[def.name] !== undefined).map(def => ({
        section,
        key: def.name,
        label: def.name,
        kind: "prop" as const,
        def,
      }))
  }
}

/* the row's current value */
export function readRow(d: Defaults, row: DRow, props: Props = {}): unknown {
  const id = SECTIONS[row.section].id
  switch (id) {
    case "placement":
      return d.placement[row.key as "place" | "gap"]
    case "shadows":
      return d.shadows[row.key]
    case "export":
      return d.export[row.key as "scale" | "background"]
    case "editor":
      return d.editor[row.key as keyof Defaults["editor"]]
    case "layout":
      return d.layout[row.key as keyof Defaults["layout"]]
    default:
      return props[row.key]
  }
}

export function display(row: DRow, v: unknown): string {
  if (row.kind === "prop" && row.def) return formatValue(row.def, v)
  if (row.kind === "bool") return v ? "on" : "off"
  return String(v ?? "")
}

export function tokenOf(row: DRow, v: unknown): string {
  return row.kind === "prop" && row.def && v !== undefined ? formatToken(row.def, v) : ""
}

/* writes one value; node sections honor the board scope, everything else is global */
export function applyRow(row: DRow, value: unknown, scope: "global" | "board"): void {
  const s = S()
  const sec = SECTIONS[row.section]
  if (sec.node) {
    if (scope === "board") {
      s.setDoc(doc => {
        const b = doc.boards[doc.currentBoard]
        b.overrides ??= {}
        const cur = (b.overrides[sec.id] ??= {})
        if (value === undefined) delete cur[row.key]
        else cur[row.key] = value
      })
    } else {
      s.setDefaults(d => {
        if (value === undefined) delete d.nodes[sec.id][row.key]
        else d.nodes[sec.id][row.key] = value
      })
    }
    return
  }
  s.setDefaults(d => {
    const target = (
      sec.id === "placement" ? d.placement : sec.id === "shadows" ? d.shadows : sec.id === "export" ? d.export : sec.id === "editor" ? d.editor : d.layout
    ) as Record<string, unknown>
    target[row.key] = value
  })
}

/* the built-in value of a row, or undefined when there is none */
function builtinOf(row: DRow): unknown {
  const sec = SECTIONS[row.section]
  const b = builtinDefaults
  return sec.node
    ? b.nodes[sec.id][row.key]
    : readRow(b, row, {})
}

/* `x`: board scope drops the override (falls back to global), global goes back to the built-in value */
export function resetRow(row: DRow, scope: "global" | "board"): void {
  const sec = SECTIONS[row.section]
  if (sec.node && scope === "board") return applyRow(row, undefined, "board")
  const v = builtinOf(row)
  if (sec.id === "shadows" && v === undefined) {
    // a user-added preset has no built-in value: remove it
    return S().setDefaults(d => void delete d.shadows[row.key])
  }
  applyRow(row, v === undefined ? undefined : structuredClone(v), "global")
}

/* Space / Shift-Space on toggleable rows */
export function cycleRowValue(row: DRow, current: unknown, dir: 1 | -1): unknown {
  if (row.kind === "bool") return !current
  const values = row.kind === "enum" ? row.values! : row.def && isToggleable(row.def) ? cycleValues(row.def) : []
  if (!values.length) return undefined
  const cur = row.kind === "prop" && row.def ? formatValue(row.def, current) : String(current)
  const i = values.indexOf(cur)
  const next = i < 0 ? (dir > 0 ? 0 : values.length - 1) : (i + dir + values.length) % values.length
  return row.kind === "prop" ? row.def!.parse(values[next]) : values[next]
}

export function nudgeRowValue(row: DRow, current: unknown, delta: number): unknown {
  if (row.kind === "number") {
    const step = row.key === "zoomStep" ? delta / 100 : delta
    return Math.max(row.min ?? 0, Math.round(((current as number) + step) * 1000) / 1000)
  }
  if (row.kind === "prop" && row.def && isNumeric(row.def)) return nudgeValue(row.def, current, delta)
  return undefined
}

/* inline edit text → value; undefined when invalid */
export function parseRowText(row: DRow, text: string): unknown {
  const t = text.trim()
  if (row.kind === "number") {
    const n = Number(t)
    return t !== "" && Number.isFinite(n) && n >= (row.min ?? 0) ? n : undefined
  }
  if (row.kind === "bool") return t === "on" || t === "true" ? true : t === "off" || t === "false" ? false : undefined
  if (row.kind === "enum") return row.values!.includes(t) ? t : undefined
  if (row.kind === "text") return t || undefined
  return row.def ? row.def.parse(t) : undefined
}

/* `i` on a node section: apply a token line as defaults (w20p h100p on Rect) */
export function tokensToProps(base: Props, line: string): Props {
  const out = { ...base }
  for (const t of tokenize(line)) if (t.def && t.parsed !== undefined) out[t.def.name] = t.parsed
  return out
}

