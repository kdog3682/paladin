import { ICON_CATALOG } from "../icons/catalog"
import { commandById } from "../commands/registry"
import { setOverride } from "../cmdline/exec"
import { effectiveKeymap } from "../keys/keymap.default"
import { fuzzy, fuzzyFilter } from "./fuzzy"
import { KEY_SECTIONS, keyRows, rowText, type KeyRow } from "./keyRows"
import {
  SECTIONS,
  applyRow,
  cycleRowValue,
  display,
  isNodeSection,
  nodeProps,
  nudgeRowValue,
  parseRowText,
  readRow,
  resetRow,
  sectionRows,
  tokensToProps,
  type DRow,
} from "./defaultsRows"
import { closeModal, openModal, patchModal, syncModalMode } from "./modal"
import { effectiveDefaults, type NodeDefaultKey } from "../store/slices/defaults"
import { S, useEditor } from "../store/useEditor"

export const ICON_COLUMNS = 8

export type DefaultsRowView = DRow & { sectionTitle: string, value: unknown }

/* rows shown in the defaults modal: the section's, or every section's matching the `/` filter */
export function defaultsView(): DefaultsRowView[] {
  const s = S()
  const { modal } = s
  const board = s.doc.boards[s.doc.currentBoard]
  const sections = modal.filter ? SECTIONS.map((_, i) => i) : [modal.section]
  const out: DefaultsRowView[] = []
  for (const i of sections) {
    const sec = SECTIONS[i]
    const props = sec.node ? nodeProps(s.defaults, sec.id as NodeDefaultKey, board.overrides, modal.scope) : {}
    for (const row of sectionRows(s.defaults, i, props)) {
      if (modal.filter && fuzzy(modal.filter, `${sec.title} ${row.label}`) === null) continue
      out.push({ ...row, sectionTitle: sec.title, value: readRow(s.defaults, row, props) })
    }
  }
  return out
}

export function keysView(): KeyRow[] {
  const s = S()
  const rows = keyRows(s.keymapOverride, KEY_SECTIONS[s.modal.section] ?? "normal")
  return s.modal.filter ? rows.filter(r => fuzzy(s.modal.filter!, rowText(r)) !== null) : rows
}

export function loaderView(): string[] {
  const s = S()
  return fuzzyFilter(Object.keys(s.components), s.modal.query, n => n)
}

export function iconsView(): string[] {
  return fuzzyFilter(ICON_CATALOG, S().modal.query, n => n)
}

const clamp = (n: number, len: number) => Math.max(0, Math.min(Math.max(0, len - 1), n))

function listLength(): number {
  const { kind } = S().modal
  if (kind === "defaults") return defaultsView().length
  if (kind === "keys") return keysView().length
  if (kind === "loader") return loaderView().length
  if (kind === "icons") return iconsView().length
  return 0
}

function currentRow(): DefaultsRowView | undefined {
  const rows = defaultsView()
  return rows[clamp(S().modal.row, rows.length)]
}

function sectionCount(): number {
  return S().modal.kind === "keys" ? KEY_SECTIONS.length : SECTIONS.length
}

function move(dir: number, count: number, axis: "vertical" | "horizontal") {
  const { modal } = S()
  if (modal.kind === "icons") {
    const step = axis === "vertical" ? ICON_COLUMNS : 1
    return patchModal({ index: clamp(modal.index + dir * step * count, listLength()) })
  }
  if (modal.kind === "loader") return axis === "vertical" ? patchModal({ index: clamp(modal.index + dir * count, listLength()) }) : undefined
  if (modal.kind !== "defaults" && modal.kind !== "keys") return
  if (axis === "vertical") return patchModal({ row: clamp(modal.row + dir * count, listLength()) })
  // sections only switch while not filtering
  if (modal.filter) return
  const n = sectionCount()
  patchModal({ section: (((modal.section + dir * count) % n) + n) % n, row: 0 })
}

function writeCurrent(fn: (row: DefaultsRowView) => unknown) {
  const row = currentRow()
  if (!row) return
  const v = fn(row)
  if (v === undefined) return S().say(`${row.label} can't do that`)
  applyRow(row, v, S().modal.scope)
}

function cycle(dir: 1 | -1) {
  if (S().modal.kind !== "defaults") return
  writeCurrent(row => cycleRowValue(row, row.value, dir))
}

function nudge(delta: number) {
  if (S().modal.kind !== "defaults") return
  writeCurrent(row => nudgeRowValue(row, row.value, delta))
}

function startEdit() {
  const { modal } = S()
  if (modal.kind === "defaults") {
    const row = currentRow()
    if (!row) return
    return startTyping({ input: row.value === undefined ? "" : display(row, row.value), editing: true })
  }
  if (modal.kind === "keys") return startTyping({ input: "", editing: false })
}

function startTyping(patch: { input: string, editing: boolean }) {
  patchModal({ ...patch, typing: true })
  syncModalMode()
}

function startInput() {
  const { modal } = S()
  if (modal.kind === "keys") return startTyping({ input: "", editing: false })
  if (modal.kind !== "defaults") return
  if (!isNodeSection(modal.section)) return S().say("i works on Rect, Ellipse, Text, Icon, Frame and Artboard")
  startTyping({ input: "", editing: false })
}

function startFilter() {
  patchModal({ filter: "", row: 0, typing: true })
  syncModalMode()
}

function reset() {
  const { modal } = S()
  if (modal.kind === "defaults") {
    const row = currentRow()
    if (row) resetRow(row, modal.scope)
    return
  }
  if (modal.kind === "keys") {
    const rows = keysView()
    const row = rows[clamp(modal.row, rows.length)]
    if (!row) return
    const mode = KEY_SECTIONS[modal.section]
    const kind = row.kind === "binding" ? "bindings" : "aliases"
    const o = S().keymapOverride
    const has = o[kind][mode] && row.lhs in o[kind][mode]
    if (has) {
      // drop the user entry: the default comes back
      const { [row.lhs]: _gone, ...rest } = o[kind][mode]
      useEditor.setState({ keymapOverride: { ...o, [kind]: { ...o[kind], [mode]: rest } } })
    } else setOverride(kind, mode, row.lhs, null)
  }
}

function toggleScope() {
  const { modal } = S()
  if (modal.kind !== "defaults") return
  if (!isNodeSection(modal.section) && modal.scope === "global") return S().say("only node defaults can override per artboard")
  patchModal({ scope: modal.scope === "global" ? "board" : "global", row: 0 })
}

function commitText() {
  const { modal } = S()
  const text = modal.input ?? ""
  if (modal.kind === "loader") return insertComponent(loaderView()[clamp(modal.index, listLength())])
  if (modal.kind === "icons") return insertIcon(iconsView()[clamp(modal.index, listLength())])
  if (modal.filter !== null && modal.input === null) {
    // filter: Enter keeps the filter and goes back to navigating
    patchModal({ typing: false })
    return syncModalMode()
  }
  if (modal.kind === "defaults") {
    if (modal.editing) {
      const row = currentRow()
      const v = row ? parseRowText(row, text) : undefined
      if (!row || v === undefined) return S().say(`invalid value: ${text}`)
      applyRow(row, v, modal.scope)
      patchModal({ input: null, editing: false, typing: false })
      return syncModalMode()
    }
    const sec = SECTIONS[modal.section]
    if (!sec.node) return
    const s = S()
    const base = nodeProps(s.defaults, sec.id as NodeDefaultKey, s.doc.boards[s.doc.currentBoard].overrides, modal.scope)
    const next = tokensToProps(base, text)
    for (const [k, v] of Object.entries(next)) if (JSON.stringify(v) !== JSON.stringify(base[k])) applyRow({ section: modal.section, key: k, label: k, kind: "prop" }, v, modal.scope)
    // Input mode semantics: the line clears and stays open
    return patchModal({ input: "" })
  }
  if (modal.kind === "keys") {
    const [lhs, rhs] = text.trim().split(/\s+/)
    if (!lhs || !rhs) return S().say("type: <keys> <commandId | keys>")
    const mode = KEY_SECTIONS[modal.section]
    setOverride(commandById.has(rhs) ? "bindings" : "aliases", mode, lhs, rhs)
    patchModal({ input: null, typing: false })
    syncModalMode()
  }
}

function cancelText() {
  const { modal } = S()
  if (modal.kind === "loader" || modal.kind === "icons") return closeModal()
  if (modal.input !== null) patchModal({ input: null, editing: false, typing: false })
  else patchModal({ filter: null, row: 0, typing: false })
  syncModalMode()
}

function setText(fn: (t: string) => string) {
  const { modal } = S()
  if (modal.kind === "loader" || modal.kind === "icons") return patchModal({ query: fn(modal.query), index: 0 })
  if (modal.input !== null) return patchModal({ input: fn(modal.input) })
  if (modal.filter !== null) patchModal({ filter: fn(modal.filter), row: 0 })
}

export function typeModal(ch: string) {
  setText(t => t + ch)
}

function insertComponent(name: string | undefined) {
  const s = S()
  const comp = name ? s.components[name] : undefined
  const sibling = s.modal.sibling
  closeModal()
  if (!comp) return S().say(name ? `no component ${name}` : "no component")
  S().commit({ type: "paste", sibling, clip: { roots: [comp.root], nodes: comp.nodes } })
}

function insertIcon(name: string | undefined) {
  const sibling = S().modal.sibling
  closeModal()
  if (name) S().commit({ type: "icon", icon: name, sibling })
}

const deleteWord = (s: string) => s.replace(/\S*\s*$/, "")

/* help items: every command with its current key (effective keymap: defaults + user overrides + aliases) */
export function helpShortcuts(): Map<string, string> {
  const km = effectiveKeymap(S().keymapOverride)
  const out = new Map<string, string>()
  // normal-mode keys first, and the first key a command has wins (defaults come before user additions)
  const scopes = Object.keys(km.bindings).sort((a, b) => Number(b === "normal") - Number(a === "normal"))
  for (const scope of scopes) {
    for (const [lhs, id] of Object.entries(km.bindings[scope])) if (!out.has(id)) out.set(id, lhs)
  }
  return out
}

export const modalHandlers: Record<string, (count: number) => void> = {
  "component.loader": () => openModal("loader", { sibling: false }),
  "component.loader.sibling": () => openModal("loader", { sibling: true }),
  "icon.picker": () => openModal("icons"),
  "help.open": () => openModal("help"),
  "modal.up": c => move(-1, c, "vertical"),
  "modal.down": c => move(1, c, "vertical"),
  "modal.left": c => move(-1, c, "horizontal"),
  "modal.right": c => move(1, c, "horizontal"),
  "modal.cycle": () => cycle(1),
  "modal.cycle.back": () => cycle(-1),
  "modal.nudge.up": () => nudge(1),
  "modal.nudge.down": () => nudge(-1),
  "modal.nudge.up.big": () => nudge(10),
  "modal.nudge.down.big": () => nudge(-10),
  "modal.edit": () => startEdit(),
  "modal.input": () => startInput(),
  "modal.filter": () => startFilter(),
  "modal.reset": () => reset(),
  "modal.scope": () => toggleScope(),
  "modal.close": () => {
    // Esc drops an applied filter before it closes the modal
    if (S().modal.filter !== null) patchModal({ filter: null, row: 0 })
    else closeModal()
  },
  "modal.text.commit": () => commitText(),
  "modal.text.cancel": () => cancelText(),
  "modal.text.backspace": () => setText(t => t.slice(0, -1)),
  "modal.text.deleteWord": () => setText(deleteWord),
}
