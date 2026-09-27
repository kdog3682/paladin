import { isolateHistory, redo, undo } from '@codemirror/commands'
import { EditorSelection, Facet, findClusterBreak, type ChangeSpec, type Text } from '@codemirror/state'
import type { Command, EditorView } from '@codemirror/view'
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
import { getVim, setVim, vimEdit, type VimSearch } from './state'

/** anything run on a normal-mode key, a plain codemirror Command works too */
export type NormalCommand = (view: EditorView) => unknown

/** normal-mode bindings keyed by space separated key sequences, ie `d i w`, `Space`, `Shift-Space`, `Ctrl-r`.
 * null removes a default binding */
export type NormalCommands = Record<string, NormalCommand | null>

const head = (view: EditorView) => view.state.selection.main.head
const line = (view: EditorView) => view.state.doc.lineAt(head(view))

const moveTo = (view: EditorView, pos: number) =>
  view.dispatch({ selection: { anchor: clampNormal(view.state.doc, pos) }, scrollIntoView: true })

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
) => {
  const set = view.state.changes(changes)
  const doc = set.apply(view.state.doc)
  const pos = typeof anchor === 'number' ? anchor : anchor(doc)
  view.dispatch({
    changes: set,
    selection: { anchor: clampNormal(doc, pos) },
    annotations: [vimEdit.of(true), isolateHistory.of('full')],
    userEvent,
    scrollIntoView: true,
  })
}

const insertAt = (view: EditorView, anchor: number, changes?: ChangeSpec) =>
  view.dispatch({
    ...(changes && { changes, userEvent: 'vim.open' }),
    selection: { anchor },
    effects: setVim.of({ mode: 'insert', pending: '' }),
    annotations: [vimEdit.of(true), isolateHistory.of('before')],
    scrollIntoView: true,
  })

const message = (view: EditorView, text: string) => view.dispatch({ effects: setVim.of({ message: text }) })

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
  view.dispatch({ selection: { anchor: pos }, effects: setVim.of({ search }), scrollIntoView: true })
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

const openPrompt = (dir: 1 | -1) => (view: EditorView) =>
  view.dispatch({ effects: setVim.of({ prompt: { dir, text: '' } }) })

/** the built-in normal-mode bindings */
export const NORMAL_COMMANDS: Record<string, NormalCommand> = {
  // modes
  'i': view => insertAt(view, head(view)),
  'a': view => insertAt(view, Math.min(head(view) + 1, line(view).to)),
  'I': view => insertAt(view, firstNonBlank(line(view))),
  'A': view => insertAt(view, line(view).to),
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
  'Escape': () => {},

  // motions
  'h': view => moveTo(view, Math.max(line(view).from, head(view) - 1)),
  'l': view => moveTo(view, Math.min(head(view) + 1, line(view).to)),
  'j': vertical(true),
  'k': vertical(false),
  'w': view => moveTo(view, nextWordStart(view.state.doc, head(view))),
  'b': view => moveTo(view, prevWordStart(view.state.doc, head(view))),
  'e': view => moveTo(view, wordEnd(view.state.doc, head(view))),
  '0': view => moveTo(view, line(view).from),
  '^': view => moveTo(view, firstNonBlank(line(view))),
  '$': view => moveTo(view, line(view).to),
  'g g': view => moveTo(view, firstNonBlank(view.state.doc.line(1))),
  'G': view => moveTo(view, firstNonBlank(view.state.doc.line(view.state.doc.lines))),

  // edits
  'x': view => {
    const h = head(view)
    const l = line(view)
    if (h >= l.to) return
    const to = l.from + findClusterBreak(l.text, h - l.from)
    edit(view, { from: h, to }, h, 'vim.delete')
  },
  'd w': view => {
    const h = head(view)
    // like vim, dw on the last word of a line stops at the line end instead of joining lines
    const to = Math.min(nextWordStart(view.state.doc, h), line(view).to)
    if (to > h) edit(view, { from: h, to }, h, 'vim.delete')
  },
  'd i w': view => {
    const range = wordRangeAt(view.state.doc, head(view))
    if (range) edit(view, range, range.from, 'vim.delete')
  },
  'd d': view => {
    const { doc } = view.state
    const l = line(view)
    const last = l.number === doc.lines
    const from = last ? Math.max(0, l.from - 1) : l.from
    const to = last ? l.to : l.to + 1
    edit(view, { from, to }, next => firstNonBlank(next.lineAt(Math.min(from, next.length))), 'vim.delete')
  },
  'u': view => {
    if (undo(view)) moveTo(view, head(view))
  },
  'r': view => {
    if (redo(view)) moveTo(view, head(view))
  },

  // search
  '/': openPrompt(1),
  '?': openPrompt(-1),
  'n': repeatSearch(false),
  'N': repeatSearch(true),
  '*': searchKeyword(1),
  '#': searchKeyword(-1),
}

/** extra normal-mode bindings merged over NORMAL_COMMANDS, higher precedence wins */
export const normalCommands = Facet.define<NormalCommands, Record<string, NormalCommand>>({
  combine(values) {
    const merged: NormalCommands = { ...NORMAL_COMMANDS }
    // facet values arrive highest precedence first, so apply them in reverse
    for (const value of [...values].reverse()) Object.assign(merged, value)
    return Object.fromEntries(
      Object.entries(merged).filter((entry): entry is [string, NormalCommand] => entry[1] !== null),
    )
  },
})

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
