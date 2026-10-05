import { ghost } from "../input-mode/complete"
import { styleNames } from "../input-mode/styles"
import { COMMAND_NAMES } from "./parse"

const SUBCOMMANDS: Record<string, string[]> = {
  board: ["new", "desktop", "laptop", "tablet", "mobile"],
  comp: ["save"],
  style: ["save"],
  export: ["yaml", "png", "svg"],
  defaults: ["export", "import", "rect", "ellipse", "text", "icon", "frame", "artboard", "placement", "editor", "layout"],
  set: ["place", "grid", "search", "attrs"],
}

/* ghost text for the command line: command names, subcommands, then property tokens */
export function cmdGhost(line: string, extra: string[] = []): string {
  if (!line.trim()) return ""
  const m = /^(\S+)\s+(\S*)$/.exec(line)
  if (m && SUBCOMMANDS[m[1]]) {
    const hit = SUBCOMMANDS[m[1]].find(w => w.length > m[2].length && w.startsWith(m[2]))
    return hit ? hit.slice(m[2].length) : ""
  }
  if (!/\s/.test(line)) {
    const hit = COMMAND_NAMES.find(w => w.length > line.length && w.startsWith(line))
    if (hit) return hit.slice(line.length)
  }
  return ghost(line, [...styleNames(), ...extra])
}
