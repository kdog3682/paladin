import { produce } from "immer"
import type { Placement } from "../../model/placement"
import type { Doc, Props } from "../../model/types"
import { pct, px } from "../../props/parse"
import { SHADOWS } from "../../props/presets"
import type { Slice } from "../useEditor"

export type NodeDefaultKey = "rect" | "ellipse" | "text" | "span" | "icon" | "frame" | "artboard"

export type EditorSettings = {
  /* px per Move-mode step in absolute parents */
  gridSize: number
  /* zoom factor step, 0.25 = 25% per press */
  zoomStep: number
  historyDepth: number
  /* ms before the which-key popup shows */
  whichKeyDelay: number
  /* ms before an ambiguous sequence (y vs ys) resolves */
  timeoutLen: number
}

export type LayoutSettings = {
  statusLine: boolean
  tokenLine: boolean
  attributesPanel: boolean
  attributesWidth: number
  layerTree: boolean
}

export type Defaults = {
  /* initial props per insertable kind */
  nodes: Record<NodeDefaultKey, Props>
  placement: Placement
  editor: EditorSettings
  layout: LayoutSettings
  /* shadow preset name → css box-shadow */
  shadows: Record<string, string>
  export: ExportSettings
}

export type ExportSettings = {
  /* pixel ratio of png/svg exports */
  scale: number
  /* keep the artboard background (off exports it transparent) */
  background: boolean
}

export const builtinDefaults: Defaults = {
  nodes: {
    rect: { width: pct(20), height: pct(100), padding: px(5), bg: "muted", radius: px(6) },
    ellipse: { width: px(120), height: px(120), bg: "muted" },
    text: { textSize: "md", fg: "foreground" },
    span: {},
    icon: { width: px(24), height: px(24), fg: "foreground" },
    frame: { padding: px(5) },
    artboard: { padding: px(5), bg: "background", fg: "foreground" },
  },
  placement: { place: "right", gap: 8 },
  editor: { gridSize: 8, zoomStep: 0.25, historyDepth: 300, whichKeyDelay: 400, timeoutLen: 500 },
  layout: { statusLine: true, tokenLine: true, attributesPanel: true, attributesWidth: 280, layerTree: false },
  shadows: { ...SHADOWS },
  export: { scale: 2, background: true },
}

/* the shadow presets are read by the registry's toCss, so the live table is kept in sync with the defaults */
export function syncShadows(shadows: Record<string, string>): void {
  for (const k of Object.keys(SHADOWS)) if (!(k in shadows)) delete SHADOWS[k]
  Object.assign(SHADOWS, shadows)
}

/* defaults with the current artboard's overrides laid over the global node defaults (§13 scope) */
export function effectiveDefaults(s: { defaults: Defaults, doc: Doc }): Defaults {
  const over = s.doc.boards[s.doc.currentBoard]?.overrides
  if (!over) return s.defaults
  const nodes = { ...s.defaults.nodes }
  for (const [k, props] of Object.entries(over)) nodes[k as NodeDefaultKey] = { ...nodes[k as NodeDefaultKey], ...props }
  return { ...s.defaults, nodes }
}

/* fills keys added to builtinDefaults after a user's defaults were saved */
export function mergeDefaults(saved: Partial<Defaults> | undefined): Defaults {
  const b = builtinDefaults
  if (!saved) return b
  return {
    nodes: { ...b.nodes, ...saved.nodes },
    placement: { ...b.placement, ...saved.placement },
    editor: { ...b.editor, ...saved.editor },
    layout: { ...b.layout, ...saved.layout },
    shadows: { ...b.shadows, ...saved.shadows },
    export: { ...b.export, ...saved.export },
  }
}

export type DefaultsSlice = {
  defaults: Defaults
  setDefaults: (fn: (d: Defaults) => void) => void
}

export const createDefaultsSlice: Slice<DefaultsSlice> = (set, get) => ({
  defaults: builtinDefaults,
  setDefaults: fn => {
    const defaults = produce(get().defaults, fn)
    syncShadows(defaults.shadows)
    set({ defaults })
  },
})
