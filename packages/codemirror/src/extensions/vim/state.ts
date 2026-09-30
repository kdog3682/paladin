import { Annotation, StateEffect, StateField, type EditorState, type Transaction } from '@codemirror/state'

export type VimMode = 'normal' | 'insert' | 'visual'

/** normal and visual mode both leave the document alone unless a vim command edits it */
export const isReadOnlyMode = (mode: VimMode) => mode !== 'insert'

export type VimSearch = {
  /* the literal text being searched for */
  query: string
  /* only match when not surrounded by word chars (set by * and #), also forces case sensitivity */
  wholeWord: boolean
  /* 1 searches forward, -1 backward. n repeats it, N reverses it */
  dir: 1 | -1
}

/** a line the panel is reading from the keyboard. `label` is the prefix it shows,
 * `kind` decides what Enter does with the text */
export type VimPrompt =
  | { kind: 'search', label: string, text: string, dir: 1 | -1 }
  | { kind: 'wrap', label: string, text: string }

/** where `b` and `f` walk: the positions real jumps have landed on, oldest first,
 * with `index` pointing at the entry the cursor is sitting on */
export type VimJumps = {
  list: number[]
  index: number
}

export const emptyJumps: VimJumps = { list: [], index: -1 }

/** how far back b can reach; the oldest entries fall off the front */
const MAX_JUMPS = 100

/** record a jump from `from` to `to`. Anything ahead of the current entry is a forward
 * history that this jump replaces, and the entry left behind is refreshed to `from`,
 * since small motions will have drifted the cursor off it since the last jump */
export const recordJump = ({ list, index }: VimJumps, from: number, to: number): VimJumps => {
  const kept = index >= 0 ? list.slice(0, index + 1) : []
  if (kept.length) kept[kept.length - 1] = from
  else kept.push(from)
  kept.push(to)
  const trimmed = kept.slice(-MAX_JUMPS)
  return { list: trimmed, index: trimmed.length - 1 }
}

/** the unnamed register: what y, d, x and c last took */
export type VimRegister = {
  text: string
  /* a whole-line yank, pasted onto its own line by p and P */
  linewise: boolean
}

export type VimState = {
  mode: VimMode
  /* in visual mode, whether the selection covers whole lines (V rather than v) */
  visualLine: boolean
  /* space separated keys typed so far for a multi-key command, ie `d i` while typing diw */
  pending: string
  /* the open panel prompt, if any */
  prompt: VimPrompt | null
  /* the last executed search, reused by n and N */
  search: VimSearch | null
  /* the unnamed register, reused by p and P */
  register: VimRegister | null
  /* the jump list b and f walk */
  jumps: VimJumps
  /* a one-off status message such as "pattern not found", cleared on the next key */
  message: string | null
}

export const initialVimState = (mode: VimMode): VimState => ({
  mode,
  visualLine: false,
  pending: '',
  prompt: null,
  search: null,
  register: null,
  jumps: emptyJumps,
  message: null,
})

/** merge a partial update into the vim state */
export const setVim = StateEffect.define<Partial<VimState>>()

/** marks a doc change as coming from vim, so it passes the read-only filter */
export const vimEdit = Annotation.define<boolean>()

/** overrides what a selection change does to the jump list: `record` always adds an entry
 * (a search landing on the same line still counts), `skip` never does (b and f themselves) */
export const vimJump = Annotation.define<'record' | 'skip'>()

/** whether a cursor move is worth remembering: a jumpy one, not h / l / w within a line */
const isJump = (tr: Transaction, from: number, to: number) => {
  const mark = tr.annotation(vimJump)
  if (mark) return mark === 'record'
  if (tr.isUserEvent('select.pointer')) return true
  const { doc } = tr.startState
  return doc.lineAt(from).number !== doc.lineAt(to).number
}

export const vimField = StateField.define<VimState>({
  create: () => initialVimState('insert'),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setVim)) value = { ...value, ...effect.value }
    }
    if (tr.docChanged) {
      if (value.jumps.list.length) {
        value = { ...value, jumps: { ...value.jumps, list: value.jumps.list.map(pos => tr.changes.mapPos(pos)) } }
      }
    } else if (tr.selection) {
      // edits move the cursor constantly (every keystroke in insert mode), so only a move
      // on an untouched document can be a jump
      const from = tr.startState.selection.main.head
      const to = tr.newSelection.main.head
      if (from !== to && isJump(tr, from, to)) value = { ...value, jumps: recordJump(value.jumps, from, to) }
    }
    return value
  },
})

export const getVim = (state: EditorState): VimState | null => state.field(vimField, false) ?? null
