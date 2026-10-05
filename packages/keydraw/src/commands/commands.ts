import { cycleLine } from "../input-mode/cycle"
import { styleNames } from "../input-mode/styles"
import { ghost } from "../input-mode/complete"
import { nudgeLine, nudgeValue } from "../input-mode/nudge"
import { lastWord, tokenize } from "../input-mode/tokenize"
import { boxIn, viewportSize } from "../model/geometry"
import { currentRoot, readingOrder, siblings, topLevel, uid } from "../model/tree"
import type { Node } from "../model/types"
import { byName, formatToken, isNumeric } from "../props/registry"
import { selectionOf } from "../store/slices/selection"
import { S, useEditor } from "../store/useEditor"
import { searchHandlers, typeSearch } from "../search/search"
import { attrsHandlers } from "../ui/attrsCommands"
import { modalHandlers, typeModal } from "../ui/modalCommands"
import { cmdHandlers, typeCmd } from "../cmdline/commands"
import { arrangeHandlers } from "../arrange/commands"
import { moveHandlers } from "../move-mode/commands"
import type { Change } from "./changes"

export type Handler = (count: number) => void

const set = useEditor.setState

/* ---------- navigation ---------- */

function walk(step: (id: string) => string | undefined, count: number) {
  let id = S().focus
  for (let i = 0; i < count; i++) {
    const next = step(id)
    if (!next) break
    id = next
  }
  S().setFocus(id)
}

const sibling = (dir: number) => (id: string) => {
  const sib = siblings(S().doc, id)
  return sib[sib.indexOf(id) + dir]
}

function boardOrder(): string[] {
  const doc = S().doc
  return readingOrder(doc, currentRoot(doc))
}

function readStep(dir: number, count: number) {
  const order = boardOrder()
  const i = order.indexOf(S().focus)
  S().setFocus(order[Math.max(0, Math.min(order.length - 1, i + dir * count))])
}

/* ---------- selection ---------- */

function extend(dir: number, count: number) {
  const s = S()
  const sel = s.selected.length ? [...s.selected] : [s.focus]
  let id = s.focus
  for (let i = 0; i < count; i++) {
    const next = sibling(dir)(id)
    if (!next) break
    id = next
    if (!sel.includes(id)) sel.push(id)
  }
  set({ selected: sel })
  s.setFocus(id)
}

function expand() {
  const s = S()
  const doc = s.doc
  const cur = selectionOf(s)
  const parents = new Set(cur.map(id => doc.nodes[id].parent))
  const parent = parents.size === 1 ? [...parents][0] : null
  const sibs = parent ? doc.nodes[parent].children : []
  let next: string[]
  let focus = s.focus
  if (parent && sibs.some(id => !cur.includes(id))) next = [...sibs]
  else {
    const up = parent ?? doc.nodes[cur[0]].parent
    if (!up) return
    next = [up]
    focus = up
  }
  set({ selStack: [...s.selStack, { selected: s.selected, focus: s.focus }], selected: next })
  if (focus !== s.focus) s.setFocus(focus)
}

function shrink() {
  const s = S()
  const top = s.selStack[s.selStack.length - 1]
  if (!top) return
  set({ selected: top.selected, selStack: s.selStack.slice(0, -1) })
  s.setFocus(top.focus)
}

/* ---------- editing ---------- */

function focused(): Node {
  const s = S()
  return s.doc.nodes[s.focus]
}

function yank() {
  const s = S()
  const roots = topLevel(s.doc, selectionOf(s))
  const nodes: Record<string, Node> = {}
  for (const r of roots) for (const id of readingOrder(s.doc, r)) nodes[id] = JSON.parse(JSON.stringify(s.doc.nodes[id]))
  set({ clipboard: { roots, nodes } })
  s.say(`yanked ${roots.length}`)
}

function paste(sibling: boolean) {
  const clip = S().clipboard
  if (!clip) return S().say("nothing yanked")
  S().commit({ type: "paste", sibling, clip })
}

function yankStyle() {
  const { x: _x, y: _y, ...props } = focused().props
  set({ styleClip: JSON.parse(JSON.stringify(props)) })
  S().say("yanked style")
}

function repeat(count: number) {
  const change = S().lastChange
  if (!change) return
  for (let i = 0; i < count; i++) S().commit(change)
}

/* ---------- text mode ---------- */

function previewText() {
  const t = S().text
  if (!t) return
  S().preview(t.insert ? ({ ...t.insert, text: t.buffer } as Change) : { type: "setText", id: t.target, text: t.buffer })
}

function startText(target: string, buffer: string, insert: Change | null) {
  const s = S()
  set({ mode: "text", prevMode: s.mode === "text" ? s.prevMode : s.mode, text: { target, buffer, insert } })
  previewText()
}

function endText() {
  S().preview(null)
  set({ mode: S().prevMode, text: null })
}

function setBuffer(fn: (b: string) => string) {
  const t = S().text
  if (!t) return
  set({ text: { ...t, buffer: fn(t.buffer) } })
  previewText()
}

function insertSpan(sibling: boolean) {
  const id = uid()
  startText(id, "", { type: "insert", kind: "span", sibling, id, text: "" })
}

function commitText() {
  const t = S().text
  if (!t) return
  if (t.insert) {
    if (t.buffer) S().commit({ ...t.insert, text: t.buffer } as Change)
  } else if (t.buffer !== S().doc.nodes[t.target]?.text) {
    S().commit({ type: "setText", id: t.target, text: t.buffer }, { repeatable: false })
  }
  endText()
}

const deleteWord = (s: string) => s.replace(/\S*\s*$/, "")

/* ---------- input mode ---------- */

function setLine(line: string, cycling = false) {
  set({ line, cycling })
  S().preview(line.trim() ? { type: "tokens", line } : null)
}

/* commits pending tokens as one undo step; stays in Input mode */
export function commitInput() {
  const s = S()
  const line = s.line.trim()
  if (!line) return
  const lastNumeric = tokenize(line)
    .reverse()
    .find(t => t.def && isNumeric(t.def) && t.parsed !== undefined)
  s.commit({ type: "tokens", line })
  set({ line: "", cycling: false, lastTouched: lastNumeric?.def?.name ?? s.lastTouched })
}

function cycle(dir: 1 | -1) {
  const s = S()
  if (!lastWord(s.line)) return
  const next = cycleLine(s.line, dir)
  if (next === null) setLine(s.line + " ")
  else setLine(next, true)
}

/* the line ends with a separator, or is empty */
const atBoundary = (line: string) => !line || /[\s,]$/.test(line)

/* ---------- nudge ---------- */

function nudge(delta: number) {
  const s = S()
  if (s.mode === "text") return
  if (s.mode === "input") {
    const next = nudgeLine(s.line, delta)
    if (next !== null) return setLine(next)
  }
  const prop = s.lastTouched
  const def = prop ? byName.get(prop) : undefined
  if (!prop || !def) return s.say("nothing to nudge: set a numeric property first")
  if (s.mode === "input") {
    const tok = formatToken(def, nudgeValue(def, focused().props[prop], delta))
    return setLine(atBoundary(s.line) ? s.line + tok : `${s.line} ${tok}`)
  }
  s.commit({ type: "nudge", prop, delta }, { merge: `nudge:${prop}` })
}

/* ---------- viewport ---------- */

const clampZoom = (z: number) => Math.max(0.05, Math.min(8, z))

function zoomTo(zoom: number) {
  const { x, y, zoom: z0 } = S().viewport
  const { w, h } = viewportSize()
  const nz = clampZoom(zoom)
  const cx = w / 2
  const cy = h / 2
  S().setViewport({ zoom: nz, x: cx - ((cx - x) * nz) / z0, y: cy - ((cy - y) * nz) / z0 })
}

export function fitBoard() {
  const doc = S().doc
  const b = doc.boards[doc.currentBoard]
  const { w, h } = viewportSize()
  const margin = 48
  const zoom = clampZoom(Math.min((w - margin * 2) / b.width, (h - margin * 2) / b.height))
  S().setViewport({ zoom, x: (w - b.width * zoom) / 2, y: (h - b.height * zoom) / 2, fitted: true })
}

function centerFocus() {
  const s = S()
  const { zoom } = s.viewport
  const box = boxIn(s.focus, currentRoot(s.doc), zoom)
  if (!box) return
  const { w, h } = viewportSize()
  s.setViewport({ x: w / 2 - (box.x + box.w / 2) * zoom, y: h / 2 - (box.y + box.h / 2) * zoom })
}

function pan(dy: number) {
  const v = S().viewport
  S().setViewport({ y: v.y + dy })
}

function switchBoard(dir: number, count: number) {
  const s = S()
  const order = s.doc.boardOrder
  const i = order.indexOf(s.doc.currentBoard)
  const id = order[(((i + dir * count) % order.length) + order.length) % order.length]
  if (id === s.doc.currentBoard) return
  s.setDoc(d => {
    d.currentBoard = id
  })
  const root = s.doc.boards[id].root
  S().setFocus(S().lastVisited[root] ? S().lastVisited[root] : root)
  S().clearSelection()
  fitBoard()
}

/* ---------- table ---------- */

export const handlers: Record<string, Handler> = {
  "focus.prev": c => walk(sibling(-1), c),
  "focus.next": c => walk(sibling(1), c),
  "focus.parent": c => walk(id => S().doc.nodes[id].parent ?? undefined, c),
  "focus.child": c =>
    walk(id => {
      const n = S().doc.nodes[id]
      const lv = S().lastVisited[id]
      return lv && n.children.includes(lv) ? lv : n.children[0]
    }, c),
  "focus.readNext": c => readStep(1, c),
  "focus.readPrev": c => readStep(-1, c),
  "focus.first": () => {
    const order = boardOrder()
    S().setFocus(order[1] ?? order[0])
  },
  "focus.last": () => {
    const order = boardOrder()
    S().setFocus(order[order.length - 1])
  },
  "hint.start": () => set({ hint: { typed: "" } }),
  "view.layerTree": () => S().setDefaults(d => void (d.layout.layerTree = !d.layout.layerTree)),
  "arrow.start": () => {
    set({ hint: { typed: "", purpose: "arrow" } })
    S().say("arrow to: type a hint label")
  },

  "select.toggle": () => S().toggleSelect(S().focus),
  "select.extendPrev": c => extend(-1, c),
  "select.extendNext": c => extend(1, c),
  "select.expand": () => expand(),
  "select.shrink": () => shrink(),
  "select.clear": () => {
    S().clearSelection()
    S().say(null)
  },

  "edit.delete": () => S().commit({ type: "delete" }),
  "edit.yank": () => yank(),
  "edit.pasteChild": () => paste(false),
  "edit.pasteSibling": () => paste(true),
  "edit.repeat": c => repeat(c),
  "style.yank": () => yankStyle(),
  "style.paste": () => {
    const props = S().styleClip
    if (!props) return S().say("no style yanked")
    S().commit({ type: "pasteStyle", props })
  },
  "history.undo": c => {
    for (let i = 0; i < c; i++) if (!S().undo()) return S().say("already at oldest change")
  },
  "history.redo": c => {
    for (let i = 0; i < c; i++) if (!S().redo()) return S().say("already at newest change")
  },

  "insert.rect": c => {
    for (let i = 0; i < c; i++) S().commit({ type: "insert", kind: "rect", sibling: false })
  },
  "insert.ellipse": c => {
    for (let i = 0; i < c; i++) S().commit({ type: "insert", kind: "ellipse", sibling: false })
  },
  "insert.text": () => S().commit({ type: "insert", kind: "text", sibling: false }),
  "insert.spanChild": () => insertSpan(false),
  "insert.spanSibling": () => insertSpan(true),

  "text.edit": () => {
    const n = focused()
    if (n.kind !== "text") return S().say("not a text node")
    startText(n.id, n.text ?? "", null)
  },
  "text.commit": () => commitText(),
  "text.newline": () => setBuffer(b => b + "\n"),
  "text.cancel": () => endText(),
  "text.backspace": () => setBuffer(b => b.slice(0, -1)),
  "text.deleteWord": () => setBuffer(deleteWord),

  "mode.input": () => set({ mode: "input", line: "", cycling: false }),
  "input.space": () => cycle(1),
  "input.spaceBack": () => cycle(-1),
  "input.backspace": () => setLine(S().line.slice(0, -1)),
  "input.deleteToken": () => setLine(deleteWord(S().line)),
  "input.accept": () => {
    const g = ghost(S().line, styleNames())
    if (g) setLine(S().line + g)
  },
  "input.commit": () => commitInput(),
  "input.escape": () => {
    if (S().line) setLine("")
    else set({ mode: "normal", cycling: false })
  },

  "nudge.up": () => nudge(1),
  "nudge.down": () => nudge(-1),
  "nudge.up10": () => nudge(10),
  "nudge.down10": () => nudge(-10),

  "view.zoomIn": c => zoomTo(S().viewport.zoom * (1 + S().defaults.editor.zoomStep) ** c),
  "view.zoomOut": c => zoomTo(S().viewport.zoom / (1 + S().defaults.editor.zoomStep) ** c),
  "view.zoomReset": () => zoomTo(1),
  "view.center": () => centerFocus(),
  "view.fit": () => fitBoard(),
  "view.panDown": c => pan((-viewportSize().h / 2) * c),
  "view.panUp": c => pan((viewportSize().h / 2) * c),
  "view.scrollDown": c => pan(-40 * c),
  "view.scrollUp": c => pan(40 * c),
  "board.next": c => switchBoard(1, c),
  "board.prev": c => switchBoard(-1, c),

  ...moveHandlers,
  ...arrangeHandlers,
  ...cmdHandlers,
  ...modalHandlers,
  ...attrsHandlers,
  ...searchHandlers,
}

/* typed characters in Input and Text mode */
export function typeChar(ch: string): boolean {
  const s = S()
  if (s.mode === "input") {
    const line = s.cycling && ch !== "," ? `${s.line} ` : s.line
    if (ch === " " && atBoundary(line)) return true
    setLine(line + ch)
    return true
  }
  if (s.mode === "modal-text") {
    typeModal(ch)
    return true
  }
  if (s.mode === "command") {
    typeCmd(ch)
    return true
  }
  if (s.mode === "search") {
    typeSearch(ch)
    return true
  }
  if (s.mode === "text") {
    setBuffer(b => b + ch)
    return true
  }
  return false
}
