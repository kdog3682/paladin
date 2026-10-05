/* `:` commands (§12). exec returns a status-line message, if any. */
import { icons } from "lucide-react"
import { arrangeHandlers } from "../arrange/commands"
import { commandById } from "../commands/registry"
import { exportBoardYaml, propsToTokens } from "../io/yaml"
import { exportImage, download } from "../io/image"
import { newDocument, openDocument, renameDocument } from "../io/docs"
import { exportSettings, pickAndImportSettings } from "../io/settings"
import { pascal } from "../icons/catalog"
import { byAlias } from "../props/registry"
import { addBoard, BOARD_PRESETS, readingOrder, topLevel } from "../model/tree"
import type { KeymapOverride } from "../keys/keymap.default"
import { parseSeq } from "../keys/notation"
import { selectionOf } from "../store/slices/selection"
import { effectiveDefaults } from "../store/slices/defaults"
import { S, useEditor } from "../store/useEditor"
import { openModal } from "../ui/modal"
import { fitBoard } from "../commands/commands"
import { parseCmd } from "./parse"

const KEY_MODES = ["normal", "input", "move", "text", "attrs", "search", "command", "modal", "modal-text"]

export const DEFAULTS_SECTIONS = ["rect", "ellipse", "text", "icon", "frame", "artboard", "placement", "shadows", "export", "editor", "layout"]

export function setOverride(kind: "bindings" | "aliases", mode: string, lhs: string, rhs: string | null) {
  const o = S().keymapOverride
  // replaced, never mutated: tries are memoized per override object
  const next: KeymapOverride = { ...o, [kind]: { ...o[kind], [mode]: { ...o[kind][mode], [parseSeq(lhs).join("")]: rhs } } }
  useEditor.setState({ keymapOverride: next })
}

/* [mode] <keys> [rhs] — mode is optional and defaults to normal */
function modeArgs(args: string[], needRhs: boolean): { mode: string, lhs: string, rhs?: string } | null {
  const rest = [...args]
  const mode = rest.length > (needRhs ? 2 : 1) && KEY_MODES.includes(rest[0]) ? rest.shift()! : "normal"
  if (rest.length !== (needRhs ? 2 : 1)) return null
  return { mode, lhs: rest[0], rhs: rest[1] }
}

function parseBoardSize(arg: string): [number, number] | null {
  if (arg in BOARD_PRESETS) return BOARD_PRESETS[arg]
  const m = /^(\d+)x(\d+)$/.exec(arg)
  return m ? [Number(m[1]), Number(m[2])] : null
}

function saveComponent(name: string): string {
  const s = S()
  if (!name) return "usage: :comp save <Name>"
  const roots = topLevel(s.doc, selectionOf(s)).filter(id => s.doc.nodes[id].parent)
  if (roots.length !== 1) return "select exactly one node (gw wraps several)"
  const nodes = Object.fromEntries(readingOrder(s.doc, roots[0]).map(id => [id, structuredClone(s.doc.nodes[id])]))
  s.saveComponent({ name, root: roots[0], nodes })
  return `saved component ${name}`
}

function saveStyle(name: string): string {
  const s = S()
  if (!name) return "usage: :style save <name>"
  if (byAlias.has(name) || ["flex", "grid", "abs"].includes(name) || /[\s,:]/.test(name)) return `"${name}" is already a token or not a valid name`
  const { x: _x, y: _y, ...props } = s.doc.nodes[s.focus].props
  const line = propsToTokens(props).replace(/ /g, ",")
  if (!line) return "the focused node has no properties to save"
  s.saveStyle(name, line)
  return `saved style ${name}: ${line}`
}

function setSetting(key: string, value: string | undefined): string {
  const s = S()
  if (!value) return `usage: :set ${key || "<key>"} <value>`
  if (key === "place") {
    if (value !== "right" && value !== "below") return "place is right or below"
    s.setDefaults(d => void (d.placement.place = value))
  } else if (key === "grid") {
    const n = Number(value)
    if (!(n > 0)) return "grid needs a positive number"
    s.setDefaults(d => void (d.editor.gridSize = n))
  } else if (key === "search") {
    if (value !== "board" && value !== "doc") return "search is board or doc"
    s.setSettings({ search: value })
  } else if (key === "attrs") {
    if (value !== "configured" && value !== "all") return "attrs is configured or all"
    s.setSettings({ attrs: value })
  } else return `unknown setting: ${key}`
  return `${key} = ${value}`
}

async function run(name: string, args: string[], rest: string): Promise<string | void> {
  const s = S()
  switch (name) {
    case "new":
      await newDocument()
      return fitSoon("new document")
    case "open": {
      if (!rest) return "usage: :open <doc>"
      const title = await openDocument(rest)
      return title ? fitSoon(`opened ${title}`) : `no document: ${rest}`
    }
    case "rename":
      if (!rest) return "usage: :rename <name>"
      return void renameDocument(rest)
    case "defaults": {
      if (args[0] === "export") return void exportSettings()
      if (args[0] === "import") return void pickAndImportSettings(m => S().say(m))
      const section = args[0] ? DEFAULTS_SECTIONS.indexOf(args[0].toLowerCase()) : 0
      if (section < 0) return `sections: ${DEFAULTS_SECTIONS.join(", ")}`
      return void openModal("defaults", { section })
    }
    case "keys":
      return void openModal("keys")
    case "help":
      return void openModal("help")
    case "board": {
      if (!args[0]) return "usage: :board new | <WxH> | <preset>"
      if (args[0] === "new") {
        const size = args[1] ? parseBoardSize(args[1]) : null
        const cur = s.doc.boards[s.doc.currentBoard]
        let id = ""
        s.setDoc(d => {
          id = addBoard(d, size?.[0] ?? cur.width, size?.[1] ?? cur.height, structuredClone(effectiveDefaults(s).nodes.artboard)).id
        })
        S().setFocus(S().doc.boards[id].root)
        S().clearSelection()
        fitBoard()
        return
      }
      const size = parseBoardSize(args[0])
      if (!size) return `unknown size: ${args[0]}`
      s.setDoc(d => {
        const b = d.boards[d.currentBoard]
        b.width = size[0]
        b.height = size[1]
      })
      return void fitBoard()
    }
    case "comp":
      return args[0] === "save" ? saveComponent(args.slice(1).join(" ")) : "usage: :comp save <Name>"
    case "style":
      return args[0] === "save" ? saveStyle(args[1] ?? "") : "usage: :style save <name>"
    case "icon": {
      if (!rest) return void openModal("icons")
      if (!icons[pascal(rest) as keyof typeof icons]) return `no such icon: ${rest}`
      return void s.commit({ type: "icon", icon: rest, sibling: false })
    }
    case "name":
      return void s.commit({ type: "name", name: rest }, { repeatable: false })
    case "set":
      return setSetting(args[0], args[1])
    case "unwrap":
      return void arrangeHandlers["arrange.unwrap"](1)
    case "lock":
      return void s.commit({ type: "flag", key: "locked" })
    case "hide":
      return void s.commit({ type: "flag", key: "hidden" })
    case "export": {
      const kind = args[0]
      if (kind === "yaml") return void download(`${s.doc.boards[s.doc.currentBoard].name}.yaml`, exportBoardYaml(s.doc), "text/yaml")
      if (kind === "png" || kind === "svg") {
        await exportImage(kind)
        return
      }
      return "usage: :export yaml | png | svg"
    }
    case "map":
    case "alias": {
      const a = modeArgs(args, true)
      if (!a) return `usage: :${name} [mode] <keys> <${name === "map" ? "commandId" : "keys"}>`
      if (name === "map" && !commandById.has(a.rhs!)) return `no such command: ${a.rhs}`
      setOverride(name === "map" ? "bindings" : "aliases", a.mode, a.lhs, a.rhs!)
      return `${name} ${a.mode} ${a.lhs} → ${a.rhs}`
    }
    case "unmap":
    case "unalias": {
      const a = modeArgs(args, false)
      if (!a) return `usage: :${name} [mode] <keys>`
      setOverride(name === "unmap" ? "bindings" : "aliases", a.mode, a.lhs, null)
      return `${name} ${a.mode} ${a.lhs}`
    }
  }
}

function fitSoon(message: string): string {
  // the new board renders on the next frame; fit once it has a size
  requestAnimationFrame(() => fitBoard())
  return message
}

/* runs a committed command line; property-token lines apply to the selection */
export async function execCmd(line: string): Promise<void> {
  const p = parseCmd(line)
  if (p.kind === "empty") return
  const s = S()
  if (p.kind === "tokens") {
    s.commit({ type: "tokens", line: p.line })
    return
  }
  try {
    const message = await run(p.name, p.args, p.rest)
    if (message) S().say(message)
  } catch (err) {
    S().say(`:${p.name} failed: ${(err as Error).message}`)
  }
}
