import { COMMANDS } from "../commands/registry"
import { defaultKeymap, effectiveKeymap, type KeymapOverride } from "../keys/keymap.default"

export const KEY_SECTIONS = ["normal", "input", "move", "text", "attrs", "search", "command", "modal", "modal-text"]

export type KeyRow = {
  lhs: string
  /* command id for bindings, key sequence for aliases */
  target: string
  kind: "binding" | "alias"
  source: "default" | "user" | "removed"
}

const titles = new Map(COMMANDS.map(c => [c.id, c.title]))
export const titleOf = (id: string) => titles.get(id) ?? id

/* the keymap editor's rows for one mode: effective entries, plus removed defaults */
export function keyRows(override: KeymapOverride, mode: string): KeyRow[] {
  const eff = effectiveKeymap(override)
  const rows: KeyRow[] = []
  for (const kind of ["bindings", "aliases"] as const) {
    const k = kind === "bindings" ? "binding" : "alias"
    const def = defaultKeymap[kind][mode] ?? {}
    const ovr = override[kind][mode] ?? {}
    for (const [lhs, target] of Object.entries(eff[kind][mode] ?? {})) {
      rows.push({ lhs, target, kind: k, source: ovr[lhs] != null && ovr[lhs] !== def[lhs] ? "user" : "default" })
    }
    for (const lhs of Object.keys(ovr)) if (ovr[lhs] === null && def[lhs] !== undefined) rows.push({ lhs, target: def[lhs], kind: k, source: "removed" })
  }
  return rows.sort((a, b) => a.lhs.localeCompare(b.lhs))
}

export function rowText(r: KeyRow): string {
  return `${r.lhs} ${r.kind === "binding" ? `${r.target} ${titleOf(r.target)}` : r.target}`
}
