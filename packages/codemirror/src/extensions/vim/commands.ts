import { isolateHistory, redo, undo } from '@codemirror/commands'
import {
  EditorSelection,
  Facet,
  findClusterBreak,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
  type Text,
} from '@codemirror/state'
import {
  foldable,
  foldedRanges,
  foldEffect,
  getIndentUnit,
  indentString,
  unfoldEffect,
} from '@codemirror/language'
import type { Command, EditorView } from '@codemirror/view'
import { leadingWhitespace, selectedLines } from '../lineUtils'
import {
  clampNormal,
  firstNonBlank,
  indentOf,
  nextWordStart,
  prevWordStart,
  wordEnd,
  wordRangeAt,
} from './motions'
import { findMatch, keywordAt } from './search'
import {
  getVim,
  setVim,
  vimEdit,
  vimJump,
  type VimPrompt,
  type VimRegister,
  type VimSearch,
  type VimState,
} from './state'
import { wrapSelection } from './wrap'

/** anything run on a normal-mode key, a plain codemirror Command works too */
export type NormalCommand = (view: EditorView) => unknown

/** normal-mode bindings keyed by space separated key sequences, ie `d i w`, `Space`, `Shift-Space`, `Ctrl-r`.
 * null removes a default binding */
export type NormalCommands = Record<string, NormalCommand | null>

const head = (view: EditorView) => view.state.selection.main.head
const line = (view: EditorView) => view.state.doc.lineAt(head(view))

const moveTo = (view: EditorView, pos: number) =>
  view.dispatch({ selection: { anchor: clampNormal(view.state.doc, pos) }, scrollIntoView: true })

/** move like {@link moveTo}, but always leave an entry in the jump list b and f walk */
const jumpTo = (view: EditorView, pos: number) =>
  view.dispatch({
    selection: { anchor: clampNormal(view.state.doc, pos) },
    annotations: vimJump.of('record'),
    scrollIntoView: true,
  })

const vertical = (forward: boolean) => (view: EditorView) => {
  const moved = view.moveVertically(view.state.selection.main, forward)
  const pos = clampNormal(view.state.doc, moved.head)
  // keep the goal column so j/k through short lines returns to the original column
  view.dispatch({
    selection: EditorSelection.create([EditorSelection.cursor(pos, 0, undefined, moved.goalColumn)]),
    scrollIntoView: true,
  })
}

/** apply a vim edit as its own undo step, placing the cursor (in new-doc coordinates) afterwards */
const edit = (
  view: EditorView,
  changes: ChangeSpec,
  anchor: number | ((doc: Text) => number),
  userEvent: string,
  extra?: Partial<VimState>,
) => {
  const set = view.state.changes(changes)
  const doc = set.apply(view.state.doc)
  const pos = typeof anchor === 'number' ? anchor : anchor(doc)
  view.dispatch({
    changes: set,
    selection: { anchor: clampNormal(doc, pos) },
    annotations: [vimEdit.of(true), isolateHistory.of('full')],
    ...(extra && { effects: setVim.of(extra) }),
    userEvent,
    scrollIntoView: true,
  })
}

const insertAt = (view: EditorView, anchor: number, changes?: ChangeSpec, extra?: Partial<VimState>) =>
  view.dispatch({
    ...(changes && { changes, userEvent: 'vim.open' }),
    selection: { anchor },
    effects: setVim.of({ mode: 'insert', pending: '', ...extra }),
    annotations: [vimEdit.of(true), isolateHistory.of('before')],
    scrollIntoView: true,
  })

const message = (view: EditorView, text: string) => view.dispatch({ effects: setVim.of({ message: text }) })

/** best-effort copy-out, so a yank is also available to other apps. the register,
 * not the system clipboard, is what p and P read back */
const toClipboard = (text: string) => {
  try {
    void globalThis.navigator?.clipboard?.writeText(text)
  } catch {
    // no clipboard permission, or no clipboard at all: the register still has it
  }
}

/** the system clipboard's text, or null where there is no readable clipboard */
const fromClipboard = (): Promise<string> | null => {
  try {
    return globalThis.navigator?.clipboard?.readText?.() ?? null
  } catch {
    return null
  }
}

/** read the system clipboard as a register and hand it to `paste`, falling back to the
 * unnamed register whenever the clipboard is unavailable, denied or empty */
const withClipboard = (view: EditorView, paste: (register: VimRegister) => unknown, fallback: () => unknown) => {
  const pending = fromClipboard()
  if (!pending) return fallback()
  void pending.then(
    text => (text
      // a copied whole line arrives with its newline, and pastes onto its own line
      ? paste({ text: text.replace(/\n+$/, ''), linewise: /\n$/.test(text) })
      : fallback()),
    () => fallback(),
  )
}

/** delete a range into the unnamed register */
const cut = (
  view: EditorView,
  from: number,
  to: number,
  anchor: number | ((doc: Text) => number),
  extra?: Partial<VimState>,
) => {
  const text = view.state.sliceDoc(from, to)
  toClipboard(text)
  edit(view, { from, to }, anchor, 'vim.delete', { register: { text, linewise: false }, ...extra })
}

/** paste `register` at the cursor, leaving it on the last pasted character */
const putRegister = (view: EditorView, register: VimRegister, after: boolean) => {
  const l = line(view)
  if (register.linewise) {
    const from = after ? l.to : l.from
    const insert = after ? `\n${register.text}` : `${register.text}\n`
    return edit(view, { from, insert }, doc => firstNonBlank(doc.lineAt(after ? from + 1 : from)), 'vim.paste')
  }
  const from = after ? Math.min(head(view) + 1, l.to) : head(view)
  edit(view, { from, insert: register.text }, from + Math.max(register.text.length - 1, 0), 'vim.paste')
}

/** `p` / `P`: paste the unnamed register */
const put = (view: EditorView, after: boolean) => {
  const register = getVim(view.state)?.register
  if (!register) return message(view, 'register empty')
  putRegister(view, register, after)
}

/** `Ctrl-v`: paste the system clipboard, so a copy from another app comes in */
const putClipboard = (after: boolean) => (view: EditorView) =>
  withClipboard(view, register => putRegister(view, register, after), () => put(view, after))

/** `b` / `f`: step back or forward through the jump list */
const walkJumps = (step: -1 | 1) => (view: EditorView) => {
  const jumps = getVim(view.state)?.jumps
  if (!jumps) return
  const { list, index } = jumps
  const next = index + step
  if (next < 0 || next >= list.length) return message(view, step < 0 ? 'no earlier position' : 'no later position')
  // motions since the last jump will have drifted the cursor off its entry, so refresh it
  const updated = list.slice()
  updated[index] = head(view)
  view.dispatch({
    selection: { anchor: clampNormal(view.state.doc, updated[next]!) },
    effects: setVim.of({ jumps: { list: updated, index: next }, message: null }),
    annotations: vimJump.of('skip'),
    scrollIntoView: true,
  })
}

/** turn an ordinary editing command into a normal-mode one: it lands in insert mode
 * wherever the command left the cursor, which is what the `q` chords expect */
export const insertCommand = (command: NormalCommand): NormalCommand => view => {
  view.dispatch({
    effects: setVim.of({ mode: 'insert', pending: '', message: null }),
    annotations: isolateHistory.of('before'),
  })
  command(view)
}

export type JumpOpts = {
  /* search in the opposite direction of the stored search (N) */
  reverse?: boolean
  /* search relative to this position instead of the cursor */
  from?: number
}

/** jump to the next match of a search and remember it for n / N */
export const jump = (view: EditorView, search: VimSearch, opts: JumpOpts = {}) => {
  const dir = (opts.reverse ? -search.dir : search.dir) as 1 | -1
  const pos = findMatch(view.state.doc.toString(), search.query, opts.from ?? head(view), dir, {
    wholeWord: search.wholeWord,
    caseSensitive: search.wholeWord || undefined,
  })
  if (pos === null) {
    view.dispatch({ effects: setVim.of({ search, message: `pattern not found: ${search.query}` }) })
    return
  }
  view.dispatch({
    selection: { anchor: pos },
    effects: setVim.of({ search }),
    annotations: vimJump.of('record'),
    scrollIntoView: true,
  })
}

const repeatSearch = (reverse: boolean) => (view: EditorView) => {
  const search = getVim(view.state)?.search
  if (search) jump(view, search, { reverse })
  else message(view, 'no previous search')
}

const searchKeyword = (dir: 1 | -1) => (view: EditorView) => {
  const l = line(view)
  const keyword = keywordAt(l.text, head(view) - l.from)
  if (!keyword) return message(view, 'no word under cursor')
  // search from the word's start so the word itself is skipped in both directions
  jump(view, { query: keyword.word, wholeWord: true, dir }, { from: l.from + keyword.from })
}

const openSearchPrompt = (dir: 1 | -1) => (view: EditorView) =>
  view.dispatch({
    effects: setVim.of({ prompt: { kind: 'search', label: dir === 1 ? '/' : '?', text: '', dir } }),
  })

const openWrapPrompt = (view: EditorView) =>
  view.dispatch({ effects: setVim.of({ prompt: { kind: 'wrap', label: 'wrap ', text: '' }, pending: '' }) })

/** Enter on an open prompt: run whatever the prompt was collecting text for */
export const submitPrompt = (view: EditorView, prompt: VimPrompt, vim: VimState) => {
  if (prompt.kind === 'wrap') return wrapSelection(view, prompt.text)
  // an empty query repeats the last search, keeping its wholeWord flag
  const query = prompt.text || vim.search?.query
  if (query) jump(view, { query, wholeWord: !prompt.text && !!vim.search?.wholeWord, dir: prompt.dir })
}

/** grow a range to cover whole lines, keeping the direction it was drawn in */
const toLines = (state: EditorState, range: SelectionRange) => {
  const from = state.doc.lineAt(range.from).from
  const to = state.doc.lineAt(range.to).to
  return range.anchor <= range.head ? EditorSelection.range(from, to) : EditorSelection.range(to, from)
}

/** `v` selects the character under the cursor, `V` the whole line */
const enterVisual = (linewise: boolean) => (view: EditorView) => {
  const h = head(view)
  const l = line(view)
  view.dispatch({
    selection: linewise
      ? EditorSelection.single(l.from, l.to)
      : EditorSelection.single(h, Math.min(h + 1, l.to)),
    effects: setVim.of({ mode: 'visual', visualLine: linewise, pending: '', message: null }),
  })
}

/** `z f`: unfold the fold that starts on the cursor's line, otherwise fold the nearest
 * foldable line at or above it that still covers the cursor, parking the cursor on that line */
const toggleFold = (view: EditorView) => {
  const { state } = view
  const l = line(view)
  const folded: { from: number, to: number }[] = []
  foldedRanges(state).between(l.from, l.to, (from, to) => void folded.push({ from, to }))
  if (folded.length) return view.dispatch({ effects: folded.map(r => unfoldEffect.of(r)) })
  for (let n = l.number; n >= 1; n--) {
    const candidate = state.doc.line(n)
    const range = foldable(state, candidate.from, candidate.to)
    if (!range || range.to < l.to) continue
    return view.dispatch({
      effects: foldEffect.of(range),
      selection: { anchor: clampNormal(state.doc, candidate.from) },
      scrollIntoView: true,
    })
  }
  message(view, 'no fold here')
}

/** the built-in normal-mode bindings */
export const NORMAL_COMMANDS: Record<string, NormalCommand> = {
  // modes
  'i': view => insertAt(view, head(view)),
  'a': view => insertAt(view, Math.min(head(view) + 1, line(view).to)),
  'I': view => insertAt(view, firstNonBlank(line(view))),
  'A': view => {
    const l = line(view)
    // appending to a line that ends in a word almost always wants a separator first
    const space = l.text.length > 0 && !/\s$/.test(l.text)
    insertAt(view, l.to + (space ? 1 : 0), space ? { from: l.to, insert: ' ' } : undefined)
  },
  'o': view => {
    const l = line(view)
    const indent = indentOf(l.text)
    insertAt(view, l.to + 1 + indent.length, { from: l.to, insert: `\n${indent}` })
  },
  'O': view => {
    const l = line(view)
    const indent = indentOf(l.text)
    insertAt(view, l.from + indent.length, { from: l.from, insert: `${indent}\n` })
  },
  'v': enterVisual(false),
  'V': enterVisual(true),
  'Escape': () => {},

  // motions
  'h': view => moveTo(view, Math.max(line(view).from, head(view) - 1)),
  'l': view => moveTo(view, Math.min(head(view) + 1, line(view).to)),
  // b / f walk the jump list, vim's Ctrl-o / Ctrl-i. vim's word-backwards is on `B`
  'b': walkJumps(-1),
  'f': walkJumps(1),
  'j': vertical(true),
  'k': vertical(false),
  'ArrowLeft': view => moveTo(view, Math.max(line(view).from, head(view) - 1)),
  'ArrowRight': view => moveTo(view, Math.min(head(view) + 1, line(view).to)),
  'ArrowDown': vertical(true),
  'ArrowUp': vertical(false),
  'w': view => moveTo(view, nextWordStart(view.state.doc, head(view))),
  // W mirrors w for visual mode, where `w` is the wrap prompt instead
  'W': view => moveTo(view, nextWordStart(view.state.doc, head(view))),
  'B': view => moveTo(view, prevWordStart(view.state.doc, head(view))),
  'e': view => moveTo(view, wordEnd(view.state.doc, head(view))),
  '0': view => moveTo(view, line(view).from),
  '^': view => moveTo(view, firstNonBlank(line(view))),
  '$': view => moveTo(view, line(view).to),
  'g g': view => jumpTo(view, firstNonBlank(view.state.doc.line(1))),
  'G': view => jumpTo(view, firstNonBlank(view.state.doc.line(view.state.doc.lines))),

  // edits
  'x': view => {
    const h = head(view)
    const l = line(view)
    if (h >= l.to) return
    const to = l.from + findClusterBreak(l.text, h - l.from)
    cut(view, h, to, h)
  },
  'D': view => {
    const h = head(view)
    const l = line(view)
    if (h < l.to) cut(view, h, l.to, h)
  },
  'd w': view => {
    const h = head(view)
    // like vim, dw on the last word of a line stops at the line end instead of joining lines
    const to = Math.min(nextWordStart(view.state.doc, h), line(view).to)
    if (to > h) cut(view, h, to, h)
  },
  // the insert-mode twin of D: take the rest of the line and carry on typing in its place
  'd l': view => {
    const h = head(view)
    const l = line(view)
    if (h >= l.to) return insertAt(view, h)
    const text = view.state.sliceDoc(h, l.to)
    toClipboard(text)
    insertAt(view, h, { from: h, to: l.to }, { register: { text, linewise: false } })
  },
  'd i w': view => {
    const range = wordRangeAt(view.state.doc, head(view))
    if (range) cut(view, range.from, range.to, range.from)
  },
  'd d': view => {
    const { doc } = view.state
    const l = line(view)
    const last = l.number === doc.lines
    const from = last ? Math.max(0, l.from - 1) : l.from
    const to = last ? l.to : l.to + 1
    toClipboard(l.text)
    // the register holds the line itself, without whichever newline was swept up with it
    edit(view, { from, to }, next => firstNonBlank(next.lineAt(Math.min(from, next.length))), 'vim.delete', {
      register: { text: l.text, linewise: true },
    })
  },

  // registers
  'y y': view => {
    const l = line(view)
    toClipboard(l.text)
    view.dispatch({ effects: setVim.of({ register: { text: l.text, linewise: true }, message: 'yanked 1 line' }) })
  },
  'p': view => put(view, true),
  'P': view => put(view, false),
  'Ctrl-v': putClipboard(true),

  // folds
  'z f': toggleFold,

  'u': view => {
    if (undo(view)) moveTo(view, head(view))
  },
  'r': view => {
    if (redo(view)) moveTo(view, head(view))
  },

  // search
  '/': openSearchPrompt(1),
  '?': openSearchPrompt(-1),
  'n': repeatSearch(false),
  'N': repeatSearch(true),
  '*': searchKeyword(1),
  '#': searchKeyword(-1),
}

/* ---- visual mode ---------------------------------------------------------- */

/**
 * Where the cursor sits in vim's terms. A charwise visual selection covers both of its
 * end characters, so the codemirror range runs one past the cursor when it points
 * forward, and the anchor sits one past its own character when it points back.
 */
const visualCursor = (state: EditorState) => {
  const { anchor, head } = state.selection.main
  if (getVim(state)?.visualLine) return head
  return head >= anchor ? Math.max(head - 1, anchor) : head
}

/** move the visual cursor to `pos`, keeping the anchored character covered.
 * in linewise mode the result is snapped back out to whole lines instead */
const extendTo = (view: EditorView, pos: number) => {
  const { state } = view
  const main = state.selection.main
  const next = Math.max(0, Math.min(pos, state.doc.length))
  const anchor = main.head >= main.anchor ? main.anchor : main.anchor - 1
  const range = getVim(state)?.visualLine
    ? toLines(state, EditorSelection.range(main.anchor, next))
    : next >= anchor
      // +1 so the character the cursor is on is part of the selection
      ? EditorSelection.range(anchor, Math.min(next + 1, state.doc.length))
      : EditorSelection.range(anchor + 1, next)
  view.dispatch({ selection: EditorSelection.create([range]), scrollIntoView: true })
}

const extendVertical = (forward: boolean) => (view: EditorView) => {
  const from = EditorSelection.cursor(visualCursor(view.state))
  extendTo(view, view.moveVertically(from, forward).head)
}

/** collapse the selection and go back to normal mode */
const leaveVisual = (view: EditorView) =>
  view.dispatch({
    selection: { anchor: clampNormal(view.state.doc, visualCursor(view.state)) },
    effects: setVim.of({ mode: 'normal', visualLine: false, pending: '', prompt: null }),
  })

/** switch between charwise and linewise, or leave visual mode when already in that one */
const toggleVisual = (linewise: boolean) => (view: EditorView) => {
  const { state } = view
  if (!!getVim(state)?.visualLine === linewise) return leaveVisual(view)
  const range = state.selection.main
  view.dispatch({
    selection: EditorSelection.create([linewise ? toLines(state, range) : range]),
    effects: setVim.of({ visualLine: linewise, pending: '' }),
  })
}

/** what the visual selection acts on. `from`/`to` is the text itself; `cutFrom`/`cutTo`
 * widens that by the newline a linewise delete takes with it */
const target = (view: EditorView) => {
  const { state } = view
  const { from, to } = state.selection.main
  const linewise = !!getVim(state)?.visualLine
  if (!linewise) {
    return { from, to, cutFrom: from, cutTo: to, text: state.sliceDoc(from, to), linewise }
  }
  const { doc } = state
  const start = doc.lineAt(from)
  const end = doc.lineAt(to)
  const last = end.number === doc.lines
  return {
    from: start.from,
    to: end.to,
    cutFrom: last ? Math.max(0, start.from - 1) : start.from,
    cutTo: last ? end.to : end.to + 1,
    text: doc.sliceString(start.from, end.to),
    linewise,
  }
}

/** `Tab` / `Shift-Tab`: shift every selected line one indent unit right or left. visual mode
 * stays on, with the selection following its text, so the shift can be repeated */
const shiftLines = (dir: 1 | -1) => (view: EditorView) => {
  const { state } = view
  const unit = indentString(state, getIndentUnit(state))
  const changes: ChangeSpec[] = []
  for (const l of selectedLines(state.doc, state.selection.main)) {
    if (!l.text.trim()) continue
    if (dir > 0) {
      changes.push({ from: l.from, insert: unit })
      continue
    }
    const ws = leadingWhitespace(l.text)
    let n = 0
    while (n < unit.length && ws[n] === ' ') n++
    if (!n && ws[0] === '\t') n = 1
    if (n) changes.push({ from: l.from, to: l.from + n })
  }
  if (!changes.length) return
  const set = state.changes(changes)
  const doc = set.apply(state.doc)
  let range = state.selection.main.map(set)
  if (getVim(state)?.visualLine) {
    // keep whole lines covered: the mapped start would otherwise sit after the new indent
    const from = doc.lineAt(range.from).from
    const to = doc.lineAt(range.to).to
    range = range.anchor <= range.head ? EditorSelection.range(from, to) : EditorSelection.range(to, from)
  }
  view.dispatch({
    changes: set,
    selection: EditorSelection.create([range]),
    annotations: [vimEdit.of(true), isolateHistory.of('full')],
    userEvent: 'vim.indent',
    scrollIntoView: true,
  })
}

/** drop `text` over the visual selection and return to normal mode. Unlike vim the replaced
 * text is dropped rather than swapped into the register, so the same yank can be pasted
 * over several selections in a row */
const replaceSelection = (view: EditorView, text: string) => {
  const { from, to, linewise } = target(view)
  edit(
    view,
    { from, to, insert: text },
    doc => (linewise ? firstNonBlank(doc.lineAt(from)) : from + Math.max(text.length - 1, 0)),
    'vim.paste',
    { mode: 'normal', visualLine: false, pending: '' },
  )
}

/** the built-in visual-mode bindings. `w` is the wrap prompt here, so `W` is word-forward */
export const VISUAL_COMMANDS: Record<string, NormalCommand> = {
  'Escape': leaveVisual,
  'v': toggleVisual(false),
  'V': toggleVisual(true),

  // motions extend the selection instead of moving the cursor
  'h': view => extendTo(view, visualCursor(view.state) - 1),
  'l': view => extendTo(view, visualCursor(view.state) + 1),
  'b': view => extendTo(view, visualCursor(view.state) - 1),
  'f': view => extendTo(view, visualCursor(view.state) + 1),
  'j': extendVertical(true),
  'k': extendVertical(false),
  'ArrowLeft': view => extendTo(view, visualCursor(view.state) - 1),
  'ArrowRight': view => extendTo(view, visualCursor(view.state) + 1),
  'ArrowDown': extendVertical(true),
  'ArrowUp': extendVertical(false),
  'W': view => extendTo(view, nextWordStart(view.state.doc, visualCursor(view.state))),
  'B': view => extendTo(view, prevWordStart(view.state.doc, visualCursor(view.state))),
  'e': view => extendTo(view, wordEnd(view.state.doc, visualCursor(view.state))),
  '0': view => extendTo(view, view.state.doc.lineAt(visualCursor(view.state)).from),
  '^': view => extendTo(view, firstNonBlank(view.state.doc.lineAt(visualCursor(view.state)))),
  '$': view => {
    // the last character of the line, not the position after it, so $ stops at the newline
    const l = view.state.doc.lineAt(visualCursor(view.state))
    extendTo(view, Math.max(l.from, l.to - 1))
  },
  'g g': view => extendTo(view, 0),
  'G': view => extendTo(view, view.state.doc.length),

  // registers
  'y': view => {
    const { from, text, linewise } = target(view)
    toClipboard(text)
    view.dispatch({
      selection: { anchor: clampNormal(view.state.doc, from) },
      effects: setVim.of({
        mode: 'normal',
        visualLine: false,
        pending: '',
        register: { text, linewise },
      }),
    })
  },
  'd': view => {
    const { cutFrom, cutTo, text, linewise } = target(view)
    if (cutFrom === cutTo) return leaveVisual(view)
    toClipboard(text)
    edit(
      view,
      { from: cutFrom, to: cutTo },
      // after taking whole lines out, land on the content of whatever line closed the gap
      doc => (linewise ? firstNonBlank(doc.lineAt(Math.min(cutFrom, doc.length))) : cutFrom),
      'vim.delete',
      { mode: 'normal', visualLine: false, pending: '', register: { text, linewise } },
    )
  },
  'c': view => {
    // change empties the lines rather than removing them, so insert lands where the text was
    const { from, to, text, linewise } = target(view)
    toClipboard(text)
    insertAt(view, from, { from, to }, { visualLine: false, register: { text, linewise } })
  },
  'p': view => {
    const register = getVim(view.state)?.register
    if (!register) return message(view, 'register empty')
    replaceSelection(view, register.text)
  },
  'Ctrl-v': view =>
    withClipboard(view, register => replaceSelection(view, register.text), () => VISUAL_COMMANDS['p']!(view)),

  'w': openWrapPrompt,

  'Tab': shiftLines(1),
  'Shift-Tab': shiftLines(-1),
  '>': shiftLines(1),
  '<': shiftLines(-1),
}

VISUAL_COMMANDS['x'] = VISUAL_COMMANDS['d']!
// Ctrl-c copies the way the rest of the app does; the register keeps it for p as well
VISUAL_COMMANDS['Ctrl-c'] = VISUAL_COMMANDS['y']!

/** bindings merged over `defaults`, higher facet precedence wins */
const commandFacet = (defaults: Record<string, NormalCommand>) =>
  Facet.define<NormalCommands, Record<string, NormalCommand>>({
    combine(values) {
      const merged: NormalCommands = { ...defaults }
      // facet values arrive highest precedence first, so apply them in reverse
      for (const value of [...values].reverse()) Object.assign(merged, value)
      return Object.fromEntries(
        Object.entries(merged).filter((entry): entry is [string, NormalCommand] => entry[1] !== null),
      )
    },
  })

/** extra normal-mode bindings merged over NORMAL_COMMANDS */
export const normalCommands = commandFacet(NORMAL_COMMANDS)

/** extra visual-mode bindings merged over VISUAL_COMMANDS */
export const visualCommands = commandFacet(VISUAL_COMMANDS)

/** Escape in insert mode: enter normal mode, stepping back one char like vim */
export const enterNormalMode: Command = view => {
  const vim = getVim(view.state)
  if (!vim || vim.mode !== 'insert') return false
  const { doc, selection } = view.state
  const h = selection.main.head
  const pos = h > doc.lineAt(h).from ? h - 1 : h
  view.dispatch({
    selection: { anchor: clampNormal(doc, pos) },
    effects: setVim.of({ mode: 'normal', pending: '' }),
  })
  return true
}
