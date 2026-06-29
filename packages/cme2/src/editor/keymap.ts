import { Facet } from '@codemirror/state'
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view'
import { getMode } from '../modes'
import type { Mode } from '../modes'

export type KeyAction = (view: EditorView) => boolean // return true = handled

export interface KeyBinding {
  seq: string // 'qw', 'zf', ';'
  run: KeyAction
  mode: Mode
}

// THE collector. Every plugin contributes here; nothing is installed until
// the single resolver below reads the facet. This is what lets fold's `zf`
// and indent's `qw` register independently but resolve together.
export const keybindings = Facet.define<KeyBinding[], KeyBinding[]>({
  combine: (groups) => groups.flat(),
})

// sugar a feature uses inside its `editor` extension. Does NOT install a keymap,
// it only adds to the facet.
export function inoremap(map: Record<string, KeyAction>, mode: Mode = 'insert') {
  return keybindings.of(
    Object.entries(map).map(([seq, run]) => ({ seq, run, mode })),
  )
}

const TIMEOUT = 400

class ChordResolver implements PluginValue {
  private buf = ''
  private timer = 0
  private all: KeyBinding[] = []

  constructor(private view: EditorView) {
    this.all = view.state.facet(keybindings)
  }

  update(u: ViewUpdate) {
    const next = u.state.facet(keybindings)
    if (next !== this.all) this.all = next
  }

  // installed as a keydown handler (see plugin spec). returns true to swallow.
  onKey(e: KeyboardEvent): boolean {
    // this resolver is the editor's; it only acts in insert mode.
    // modifier combos (ctrl+s) are handled at the window level, not here.
    if (getMode() !== 'insert') return false
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
      this.flush()
      return false
    }
    return this.feed(e.key)
  }

  private feed(key: string): boolean {
    const cand = this.buf + key
    const matches = this.all.filter((b) => b.mode === 'insert' && b.seq.startsWith(cand))
    const exact = matches.find((b) => b.seq === cand)
    const longerExists = matches.some((b) => b.seq.length > cand.length)

    if (matches.length === 0) {
      // dead end: flush whatever we swallowed, then reprocess this key fresh.
      this.flush()
      return this.buf === '' ? this.feed(key) === true && true : false
    }

    if (exact && !longerExists) {
      this.clear()
      exact.run(this.view)
      return true // swallow, action handled it
    }

    // either a pure prefix, or ambiguous (exact + longer). buffer + wait.
    this.buf = cand
    this.arm(exact)
    return true
  }

  private arm(exact?: KeyBinding) {
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => {
      if (exact) exact.run(this.view) // ambiguity resolved to the shorter match
      else this.flushLiteral()
      this.clear()
    }, TIMEOUT)
  }

  // a swallowed prefix that turned out to be just text -> insert it.
  private flushLiteral() {
    if (this.buf) this.view.dispatch(this.view.state.replaceSelection(this.buf))
  }

  private flush() {
    clearTimeout(this.timer)
    this.flushLiteral()
    this.buf = ''
  }

  private clear() {
    clearTimeout(this.timer)
    this.buf = ''
  }

  destroy() {
    clearTimeout(this.timer)
  }
}

export const chordResolver = ViewPlugin.fromClass(ChordResolver, {
  eventHandlers: {
    keydown(e, view) {
      return (view.plugin(chordResolver) as ChordResolver | null)?.onKey(e) ?? false
    },
  },
})
