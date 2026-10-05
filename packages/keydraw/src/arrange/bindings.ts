import type { ScopeTable } from "../keys/extend"
import type { AlignEdge } from "./arrange"

export const ARRANGE_BINDINGS: ScopeTable = {
  normal: {
    gw: "arrange.wrap",
    gal: "arrange.align.l",
    gac: "arrange.align.c",
    gar: "arrange.align.r",
    gat: "arrange.align.t",
    gam: "arrange.align.m",
    gab: "arrange.align.b",
    gd: "arrange.distribute",
  },
}

const EDGE_TITLES: Record<AlignEdge, string> = {
  l: "left",
  c: "center",
  r: "right",
  t: "top",
  m: "middle",
  b: "bottom",
}

export const ARRANGE_COMMANDS = [
  { id: "arrange.wrap", title: "Wrap in frame", group: "arrange", description: "Wrap the selection in a new frame" },
  { id: "arrange.unwrap", title: "Unwrap frame", group: "arrange", description: "Replace the frame with its children" },
  ...(Object.keys(EDGE_TITLES) as AlignEdge[]).map(e => ({
    id: `arrange.align.${e}`,
    title: `Align ${EDGE_TITLES[e]}`,
    group: "arrange",
    description: "Several nodes align to each other, one node aligns to its parent (absolute parents only)",
  })),
  { id: "arrange.distribute", title: "Distribute", group: "arrange", description: "Even gaps between 3+ nodes (absolute parents only)" },
]
