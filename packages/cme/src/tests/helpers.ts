// @paladin/codemirror-editor-experiment/tests/helpers.ts
import { Window } from 'happy-dom'
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view'
import { EditorState, Extension } from '@codemirror/state'

const CURSOR = '|'
const TAB_SIZE = 2
const TAB_REPLACEMENT = ' '.repeat(TAB_SIZE)

// bootstrap minimal DOM for EditorView
const win = new Window()
const doc = win.document
globalThis.document = doc as any
globalThis.window = win as any
globalThis.navigator = win.navigator as any
globalThis.MutationObserver = win.MutationObserver as any
globalThis.getComputedStyle = win.getComputedStyle.bind(win) as any
// CM6 may check for these
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = ((cb: Function) => setTimeout(cb, 0)) as any
}
if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as any
}

function resolveTabs(str: string): string {
  return str.replace(/\t/g, TAB_REPLACEMENT)
}

export function mkView(docWithCursor: string, extensions: Extension[] = []): EditorView {
  const resolved = resolveTabs(docWithCursor)
  const pos = resolved.indexOf(CURSOR)
  if (pos === -1) throw new Error('mkView: no cursor | found')
  const text = resolved.slice(0, pos) + resolved.slice(pos + 1)

  const parent = doc.createElement('div')
  doc.body.appendChild(parent)

  return new EditorView({
    state: EditorState.create({
      doc: text,
      selection: { anchor: pos },
      extensions,
    }),
    parent: parent as any,
  })
}

// run a keydown through CM6's scope handler system
// this is what CM6 uses internally to process keymap bindings
function dispatchKey(view: EditorView, key: string): boolean {
  const code = key === 'Enter' ? 'Enter'
    : key === '\\' ? 'Backslash'
    : key === '/' ? 'Slash'
    : key === ';' ? 'Semicolon'
    : key === '{' ? 'BracketLeft'
    : key === '[' ? 'BracketLeft'
    : key === '(' ? 'Digit9'
    : key === '"' ? 'Quote'
    : key === "'" ? 'Quote'
    : key === '}' ? 'BracketRight'
    : key === ']' ? 'BracketRight'
    : key === ')' ? 'Digit0'
    : `Key${key.toUpperCase()}`

  const event = new (win as any).KeyboardEvent('keydown', {
    key,
    code,
    keyCode: key.length === 1 ? key.charCodeAt(0) : 13,
    bubbles: true,
    cancelable: true,
  })

  return runScopeHandlers(view, event, 'editor')
}

// trigger inputHandler facet handlers on the view
// EditorView.inputHandler is a view-level facet, accessed via view.state.facet
// but the handlers themselves receive the view
function runInputHandlers(view: EditorView, text: string): boolean {
  const { from, to } = view.state.selection.main
  // EditorView.inputHandler stores handlers on the state via facet
  const handlers = view.state.facet(EditorView.inputHandler)
  for (const handler of handlers) {
    if (handler(view, from, to, text)) {
      return true
    }
  }
  return false
}

// simulate typing a key that goes through keymap bindings
// use for: Enter, \, /, ;, {, [, (, etc.
export function typeKey(view: EditorView, key: string) {
  const handled = dispatchKey(view, key)
  if (!handled) {
    // for closeBrackets: it uses an inputHandler, not keymap
    // so try inputHandler path too
    const inputHandled = runInputHandlers(view, key)
    if (!inputHandled) {
      // truly unhandled — in a real browser CM would insert the char
      // we do nothing here (the extension didn't catch it)
    }
  }
}

// simulate typing a string character by character
// tries inputHandlers first (for qSequence), then keymap, then raw insert
export function typeText(view: EditorView, text: string) {
  for (const ch of text) {
    // try inputHandlers first (qSequence uses this)
    const inputHandled = runInputHandlers(view, ch)
    if (!inputHandled) {
      // try keymap bindings
      const keyHandled = dispatchKey(view, ch)
      if (!keyHandled) {
        // plain character — insert directly
        view.dispatch(view.state.replaceSelection(ch))
      }
    }
  }
}

export function expectView(view: EditorView, expected: string) {
  const resolved = resolveTabs(expected)
  const expectedPos = resolved.indexOf(CURSOR)
  if (expectedPos === -1) throw new Error('expectView: no cursor | found')
  const expectedDoc = resolved.slice(0, expectedPos) + resolved.slice(expectedPos + 1)

  const actualDoc = view.state.doc.toString()
  const actualPos = view.state.selection.main.head

  if (actualDoc !== expectedDoc) {
    throw new Error(
      `Doc mismatch:\n  expected: ${JSON.stringify(expectedDoc)}\n  actual:   ${JSON.stringify(actualDoc)}`
    )
  }
  if (actualPos !== expectedPos) {
    throw new Error(
      `Cursor mismatch:\n  expected: ${expectedPos}\n  actual:   ${actualPos}\n  in doc: ${JSON.stringify(actualDoc)}`
    )
  }
}
