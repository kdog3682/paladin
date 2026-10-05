import { stringify, parse } from "yaml"
import { arrowsOf, isBound } from "../model/binding"
import { formatToken, PROPS } from "../props/registry"
import type { Doc, Node } from "../model/types"
import type { EditorState } from "../store/useEditor"

type YNode = {
  name?: string
  kind: string
  shape?: string
  text?: string
  icon?: string
  component?: string
  inline?: boolean
  locked?: boolean
  hidden?: boolean
  /* token form of the props, e.g. "p4 bg:muted w20p" */
  style?: string
  children?: YNode[]
}

/* a node's props in token form, in registry order */
export function propsToTokens(props: Node["props"]): string {
  const out: string[] = []
  for (const def of PROPS) {
    const v = props[def.name]
    if (v !== undefined) out.push(formatToken(def, v))
  }
  return out.join(" ")
}

/* "card/button": names (or kinds) from below the artboard down; bound arrows refer to nodes this way */
function nodePath(doc: Doc, id: string): string {
  const out: string[] = []
  for (let cur: string | null = id; cur && doc.nodes[cur].parent; cur = doc.nodes[cur].parent) {
    const n = doc.nodes[cur]
    out.unshift(`${n.name ?? n.shape ?? n.kind}[${doc.nodes[n.parent!].children.indexOf(cur)}]`)
  }
  return out.join("/")
}

function toY(doc: Doc, id: string): YNode {
  const n = doc.nodes[id]
  const y: YNode = { kind: n.kind }
  if (n.name) y.name = n.name
  if (n.shape && n.shape !== "rect") y.shape = n.shape
  if (n.inline) y.inline = true
  if (n.text !== undefined) y.text = n.text
  if (n.icon) y.icon = n.icon
  if (n.component) y.component = n.component
  if (n.locked) y.locked = true
  if (n.hidden) y.hidden = true
  const style = propsToTokens(n.props)
  if (style) y.style = style
  if (n.children.length) y.children = n.children.map(c => toY(doc, c))
  return y
}

/* the current artboard as YAML */
export function exportBoardYaml(doc: Doc): string {
  const board = doc.boards[doc.currentBoard]
  const arrows = arrowsOf(doc, board.id).map(a => ({
    kind: a.head ? "arrow" : "line",
    from: isBound(a.from) ? { node: nodePath(doc, a.from.node) } : a.from,
    to: isBound(a.to) ? { node: nodePath(doc, a.to.node) } : a.to,
  }))
  return stringify({ artboard: board.name, size: `${board.width}x${board.height}`, tree: toY(doc, board.root), ...(arrows.length && { arrows }) })
}

/* every portable setting in one file: defaults, styles, keymap and components (`:defaults export`) */
export function exportSettingsYaml(s: Pick<EditorState, "defaults" | "styles" | "keymapOverride" | "components">): string {
  return stringify({ keydraw: 1, defaults: s.defaults, styles: s.styles, keymap: s.keymapOverride, components: s.components })
}

export type ImportedSettings = Partial<Pick<EditorState, "defaults" | "styles" | "keymapOverride" | "components">>

export function parseSettingsYaml(text: string): ImportedSettings {
  const raw = parse(text) as Record<string, unknown> | null
  if (!raw || typeof raw !== "object" || raw.keydraw !== 1) throw new Error("not a keydraw settings file")
  return {
    defaults: raw.defaults as ImportedSettings["defaults"],
    styles: raw.styles as ImportedSettings["styles"],
    keymapOverride: raw.keymap as ImportedSettings["keymapOverride"],
    components: raw.components as ImportedSettings["components"],
  }
}
