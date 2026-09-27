import { Annotation, StateEffect, StateField, type EditorState } from '@codemirror/state'

export type VimMode = 'normal' | 'insert'

export type VimSearch = {
  /* the literal text being searched for */
  query: string
  /* only match when not surrounded by word chars (set by * and #), also forces case sensitivity */
  wholeWord: boolean
  /* 1 searches forward, -1 backward. n repeats it, N reverses it */
  dir: 1 | -1
}

export type VimPrompt = {
  /* 1 for `/`, -1 for `?` */
  dir: 1 | -1
  /* what has been typed after the / so far */
  text: string
}

export type VimState = {
  mode: VimMode
  /* space separated keys typed so far for a multi-key command, ie `d i` while typing diw */
  pending: string
  /* the open `/` or `?` prompt, if any */
  prompt: VimPrompt | null
  /* the last executed search, reused by n and N */
  search: VimSearch | null
  /* a one-off status message such as "pattern not found", cleared on the next key */
  message: string | null
}

export const initialVimState = (mode: VimMode): VimState => ({
  mode,
  pending: '',
  prompt: null,
  search: null,
  message: null,
})

/** merge a partial update into the vim state */
export const setVim = StateEffect.define<Partial<VimState>>()

/** marks a doc change as coming from vim, so it passes the normal-mode read-only filter */
export const vimEdit = Annotation.define<boolean>()

export const vimField = StateField.define<VimState>({
  create: () => initialVimState('insert'),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setVim)) value = { ...value, ...effect.value }
    }
    return value
  },
})

export const getVim = (state: EditorState): VimState | null => state.field(vimField, false) ?? null
