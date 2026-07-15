import { EditorView, runScopeHandlers } from '@codemirror/view'
import { EditorState, Extension } from '@codemirror/state'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

// register window/document/KeyboardEvent/etc. as globals once
if (!(GlobalRegistrator as any).isRegistered) {
  GlobalRegistrator.register()
}

const CURSOR = '|'
const TAB_SIZE = 2
const TAB_REPLACEMENT = ' '.repeat(TAB_SIZE)

// default ms slept between keystrokes in .type() — set to 0 for instant tests
let DEFAULT_DELAY = 100
export function setTypeDelay(ms: number) { DEFAULT_DELAY = ms }

const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve()

function resolveTabs(s: string): string {
  return s.replace(/\t/g, TAB_REPLACEMENT)
}

function splitCursor(withCursor: string): { text: string; pos: number } {
  const resolved = resolveTabs(withCursor)
  const pos = resolved.indexOf(CURSOR)
  if (pos === -1) throw new Error('no cursor | found in: ' + JSON.stringify(withCursor))
  return { text: resolved.slice(0, pos) + resolved.slice(pos + 1), pos }
}

// ---------------------------------------------------------------------------
// key parsing
// ---------------------------------------------------------------------------

type Mods = { ctrl: boolean; alt: boolean; meta: boolean; shift: boolean }

const NAMED_KEYS: Record<string, string> = {
  cr: 'Enter', enter: 'Enter', ret: 'Enter',
  esc: 'Escape', escape: 'Escape',
  tab: 'Tab',
  space: ' ', spc: ' ',
  bs: 'Backspace', backspace: 'Backspace', del: 'Delete', delete: 'Delete',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  home: 'Home', end: 'End',
}

function applyMod(mods: Mods, p: string) {
  if (p === 'c' || p === 'ctrl' || p === 'control') mods.ctrl = true
  else if (p === 'a' || p === 'alt' || p === 'opt' || p === 'option') mods.alt = true
  else if (p === 'm' || p === 'meta' || p === 'cmd' || p === 'super' || p === 'win') mods.meta = true
  else if (p === 's' || p === 'shift') mods.shift = true
}

// `<c-f>` -> ctrl+f, `<cr>` -> Enter, `<a-space>` -> alt+space, etc.
function parseToken(token: string): { key: string; mods: Mods } {
  const inner = token.slice(1, -1)
  const parts = inner.split('-')
  const mods: Mods = { ctrl: false, alt: false, meta: false, shift: false }
  let keyPart = inner
  if (parts.length > 1) {
    keyPart = parts[parts.length - 1]
    for (const p of parts.slice(0, -1)) applyMod(mods, p.toLowerCase())
  }
  const key = NAMED_KEYS[keyPart.toLowerCase()] ?? keyPart
  return { key, mods }
}

// split a type() string into chars + `<...>` tokens
function tokenize(input: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < input.length) {
    if (input[i] === '<') {
      const close = input.indexOf('>', i)
      if (close !== -1) {
        out.push(input.slice(i, close + 1))
        i = close + 1
        continue
      }
    }
    out.push(input[i])
    i++
  }
  return out
}

function keyToCode(key: string): string {
  if (key === ' ') return 'Space'
  const map: Record<string, string> = {
    Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    Home: 'Home', End: 'End',
    '\\': 'Backslash', '/': 'Slash', ';': 'Semicolon', ':': 'Semicolon',
    '{': 'BracketLeft', '[': 'BracketLeft', '}': 'BracketRight', ']': 'BracketRight',
    '(': 'Digit9', ')': 'Digit0', '"': 'Quote', "'": 'Quote',
    '-': 'Minus', '=': 'Equal', '.': 'Period', ',': 'Comma', '`': 'Backquote',
  }
  if (map[key]) return map[key]
  if (/^[a-zA-Z]$/.test(key)) return 'Key' + key.toUpperCase()
  if (/^[0-9]$/.test(key)) return 'Digit' + key
  return key
}

const KEY_CODES: Record<string, number> = {
  Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ' ': 32,
}

// ---------------------------------------------------------------------------
// chain
// ---------------------------------------------------------------------------

class EditorChain implements PromiseLike<void> {
  readonly view: EditorView
  private queue: Promise<void> = Promise.resolve()

  constructor(extensions: Extension[]) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    this.view = new EditorView({
      state: EditorState.create({ doc: '', extensions }),
      parent: parent as any,
    })
  }

  private enqueue(fn: () => void | Promise<void>): this {
    this.queue = this.queue.then(fn)
    return this
  }

  // reset doc + cursor from a `foo| bar` string
  set(docWithCursor: string): this {
    return this.enqueue(() => {
      const { text, pos } = splitCursor(docWithCursor)
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: text },
        selection: { anchor: pos },
      })
    })
  }

  type(input: string, delay = DEFAULT_DELAY): this {
    return this.enqueue(async () => {
      const tokens = tokenize(input)
      for (let i = 0; i < tokens.length; i++) {
        if (i > 0) await sleep(delay)
        this.press(tokens[i])
      }
    })
  }

  expect(expected: string): this {
    return this.enqueue(() => {
      const { text, pos } = splitCursor(expected)
      const actualDoc = this.view.state.doc.toString()
      const actualPos = this.view.state.selection.main.head
      if (actualDoc !== text) {
        throw new Error(
          `Doc mismatch:\n  expected: ${JSON.stringify(text)}\n  actual:   ${JSON.stringify(actualDoc)}`
        )
      }
      if (actualPos !== pos) {
        throw new Error(
          `Cursor mismatch:\n  expected: ${pos}\n  actual:   ${actualPos}\n  in doc: ${JSON.stringify(actualDoc)}`
        )
      }
    })
  }

  then<T = void, E = never>(
    onOk?: ((v: void) => T | PromiseLike<T>) | null,
    onErr?: ((e: unknown) => E | PromiseLike<E>) | null
  ): PromiseLike<T | E> {
    return this.queue.then(onOk, onErr)
  }

  // -- key dispatch ---------------------------------------------------------

  private press(token: string) {
    if (token.length === 1) return this.char(token)
    const { key, mods } = parseToken(token)
    const bare = !mods.ctrl && !mods.alt && !mods.meta && !mods.shift
    if (bare && key.length === 1) return this.char(key) // printable: space, etc.
    this.special(key, mods)
  }

  // printable char: inputHandler (closeBrackets, qSequence) -> keymap -> insert
  private char(ch: string) {
    const { from, to } = this.view.state.selection.main
    for (const handler of this.view.state.facet(EditorView.inputHandler)) {
      if ((handler as any)(this.view, from, to, ch)) return
    }
    if (this.dispatchKey(ch, { ctrl: false, alt: false, meta: false, shift: false })) return
    this.view.dispatch(this.view.state.replaceSelection(ch))
  }

  // modified / non-printable key: keymap, with sane fallbacks when unhandled
  private special(key: string, mods: Mods) {
    if (this.dispatchKey(key, mods)) return
    const bare = !mods.ctrl && !mods.alt && !mods.meta
    if (!bare) return
    if (key === 'Enter') this.view.dispatch(this.view.state.replaceSelection('\n'))
    else if (key === 'Tab') this.view.dispatch(this.view.state.replaceSelection(TAB_REPLACEMENT))
    else if (key === 'Backspace') this.deleteAround(-1)
    else if (key === 'Delete') this.deleteAround(1)
  }

  private deleteAround(dir: -1 | 1) {
    const { from } = this.view.state.selection.main
    const target = dir < 0 ? from - 1 : from + 1
    if (target < 0 || target > this.view.state.doc.length) return
    const range = dir < 0 ? { from: target, to: from } : { from, to: target }
    this.view.dispatch({ changes: range, selection: { anchor: range.from } })
  }

  private dispatchKey(key: string, mods: Mods): boolean {
    const event = new KeyboardEvent('keydown', {
      key,
      code: keyToCode(key),
      keyCode: KEY_CODES[key] ?? (key.length === 1 ? key.charCodeAt(0) : 0),
      ctrlKey: mods.ctrl,
      altKey: mods.alt,
      metaKey: mods.meta,
      shiftKey: mods.shift,
      bubbles: true,
      cancelable: true,
    })
    return runScopeHandlers(this.view, event, 'editor')
  }
}

// usage:
//   const view = createEditorView(exts)        // once at the top
//   await view.set('a| b').type(';;').expect('a::| b')
//   await view.set('|').type('abc<cr><esc><c-f>')
export function createEditorView(extensions: Extension[] = []): EditorChain {
  return new EditorChain(extensions)
}
