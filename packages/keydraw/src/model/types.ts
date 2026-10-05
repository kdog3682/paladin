export type Unit = "px" | "%"

export type Length = { n: number, unit: Unit } | "fill" | "hug"

export type NodeKind = "frame" | "text" | "icon" | "instance"

export type Shape = "rect" | "ellipse" | "diamond"

export type Layout = "absolute" | "flex" | "grid"

export type Props = Record<string, unknown>

export type Mode =
  | "normal"
  | "input"
  | "move"
  | "text"
  | "command"
  | "search"
  | "attrs"
  /* a modal is open: navigating (modal) or typing into its filter / input / query (modal-text) */
  | "modal"
  | "modal-text"

export type Node = {
  id: string
  kind: NodeKind
  /* optional display name shown in hints, layer tree, search and yaml */
  name?: string
  /* visual shape for frames */
  shape?: Shape
  /* text content for text nodes */
  text?: string
  /* true for inline text spans inside a container */
  inline?: boolean
  /* lucide icon name for icon nodes */
  icon?: string
  /* component name for instance nodes */
  component?: string
  /* property values keyed by PropDef.name */
  props: Props
  children: string[]
  parent: string | null
  locked?: boolean
  hidden?: boolean
}

/* a line or arrow on an artboard; ends bound to nodes follow them when they move */
export type Arrow = {
  id: string
  board: string
  /* false draws a plain line */
  head: boolean
  from: { node: string } | { x: number, y: number }
  to: { node: string } | { x: number, y: number }
}

export type Artboard = {
  id: string
  name: string
  /* id of the root frame node of this artboard's tree */
  root: string
  width: number
  height: number
  /* per-artboard node defaults that fall back to the global ones (defaults modal, board scope) */
  overrides?: Partial<Record<string, Props>>
}

export type Doc = {
  id: string
  /* untitled docs are named with their creation timestamp */
  title: string
  createdAt: number
  /* flat node map; trees are linked via parent/children ids */
  nodes: Record<string, Node>
  boards: Record<string, Artboard>
  /* artboard ids in display order */
  boardOrder: string[]
  currentBoard: string
  arrows?: Record<string, Arrow>
}
