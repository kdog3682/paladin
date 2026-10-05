import type { Doc, Node } from "../model/types"
import { PROPS, cycleValues, formatValue, isToggleable, type PropDef } from "../props/registry"

export type AttrRow = {
  /* canonical prop name, e.g. "padding" */
  name: string
  def: PropDef
  /* shared value across the selection (or its default); undefined when mixed */
  value: unknown
  /* selected nodes disagree on this prop */
  mixed: boolean
  /* the draft (live Input-mode tokens, inline edit) differs from the committed doc */
  pending: boolean
  /* every selected node is at its default */
  isDefault: boolean
}

export type RowsArgs = {
  doc: Doc
  /* live preview doc, if any */
  draft: Doc | null | undefined
  ids: string[]
  /* the defaults slice; only `nodes` is read */
  defaults: { nodes: Record<string, Record<string, unknown>> }
  /* `:set attrs all` shows every prop, not just configured ones */
  all: boolean
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Node defaults are keyed by insert kind (rect, ellipse, text, …).
 * Try the most specific key first.
 */
export function defaultsFor(nodes: Record<string, Record<string, unknown>>, node: Node): Record<string, unknown> {
  const n = node as Node & { shape?: string; inline?: boolean }
  const keys = [n.inline ? "span" : undefined, n.shape, n.kind, n.kind === "frame" ? "rect" : undefined]
  for (const k of keys) if (k && nodes[k]) return nodes[k]
  return {}
}

/* Rows for the panel: configured (non-default) props, or all with `all`. */
export function computeRows({ doc, draft, ids, defaults, all }: RowsArgs): AttrRow[] {
  const view = draft ?? doc
  const nodes = ids.map((id) => view.nodes[id]).filter(Boolean) as Node[]
  if (!nodes.length) return []
  const defs = nodes.map((n) => defaultsFor(defaults.nodes, n))
  const rows: AttrRow[] = []

  for (const def of PROPS) {
    const vals = nodes.map((n, i) => n.props[def.name] ?? defs[i][def.name])
    const present = nodes.some((n) => n.props[def.name] !== undefined)
    const isDefault = vals.every((v, i) => same(v, defs[i][def.name]))
    const pending = !!draft && ids.some((id) => !same(draft.nodes[id]?.props[def.name], doc.nodes[id]?.props[def.name]))
    if (!all && !pending && (!present || isDefault)) continue
    const mixed = vals.some((v) => !same(v, vals[0]))
    rows.push({ name: def.name, def, value: mixed ? undefined : vals[0], mixed, pending, isDefault })
  }
  return rows
}

/* Next value when cycling a toggleable row with Space / Shift-Space. undefined if not toggleable. */
export function cycleRow(row: AttrRow, dir: 1 | -1): unknown {
  if (!isToggleable(row.def)) return undefined
  const values = cycleValues(row.def)
  if (!values.length) return undefined
  const cur = row.mixed || row.value === undefined ? "" : formatValue(row.def, row.value)
  const i = values.indexOf(cur)
  const next = i < 0 ? (dir > 0 ? 0 : values.length - 1) : (i + dir + values.length) % values.length
  return row.def.parse(values[next])
}

/* ±d on a numeric or px/% length value. undefined for fill/hug/mixed/non-numeric. */
export function nudgeRow(row: AttrRow, d: number): unknown {
  if (row.mixed) return undefined
  const v = row.value
  if (typeof v === "number") return v + d
  if (v && typeof v === "object" && "n" in v) {
    const len = v as { n: number; unit: string }
    return { ...len, n: len.n + d }
  }
  if (v === undefined && (row.def.kind === "number" || row.def.kind === "length")) {
    return row.def.kind === "number" ? d : { n: d, unit: "px" }
  }
  return undefined
}

/* Breadcrumb labels from the artboard root down to the node. */
export function breadcrumb(doc: Doc, id: string): string[] {
  const out: string[] = []
  let cur: string | null | undefined = id
  while (cur) {
    const node: Node | undefined = doc.nodes[cur]
    if (!node) break
    out.unshift(node.parent ? (node.name ?? node.kind) : boardName(doc, cur))
    cur = node.parent
  }
  return out
}

function boardName(doc: Doc, rootId: string): string {
  const boards = (doc as Doc & { boards?: Record<string, { root: string; name: string }> }).boards
  const board = boards && Object.values(boards).find((b) => b.root === rootId)
  return board?.name ?? "Artboard"
}
