// === /home/kdog3682/projects/paladin/packages/codemirror-editor-experiment/src/extensions.ts ===
// @paladin/codemirror-editor-experiment/extensions.ts
import { EditorView, placeholder, keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import { indentOnInput, indentUnit, bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { theme } from './theme'
import { backtickHighlighter, headingHighlighter } from './decorations'
import { semicolonToColon } from './keybindings/semicolonToColon'
import { smartEnter } from './keybindings/smartEnter'
import { qChord } from './keybindings/qChord'
import { backslashContinue } from './keybindings/backslashContinue'
import { slashAutocomplete } from './keybindings/slashAutocomplete'
import { insertCodeBlock } from './keybindings/insertCodeBlock'
import { headingKey } from './keybindings/headingKey'
import { dashRule } from './keybindings/dashRule'
import { swapKeys } from './keybindings/swapKeys'
import { bracketNewline } from './keybindings/bracketNewline'

type SaveFn = (view: EditorView) => boolean

export function createExtensions(saveToStorage: SaveFn): Extension[] {
  return [
    theme,
    indentUnit.of('  '),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
    bracketNewline(),
    smartEnter(),
    keymap.of([indentWithTab]),
    semicolonToColon(),
    qChord(),
    backslashContinue(),
    slashAutocomplete(),
    placeholder('Start typing...'),
    EditorView.lineWrapping,
    history(),
    keymap.of(historyKeymap),
    headingHighlighter,
    backtickHighlighter,
    insertCodeBlock(),
    headingKey(),
    dashRule(),
    swapKeys(),
    keymap.of([{ key: 'Mod-s', run: saveToStorage }]),
  ]
}


// === /home/kdog3682/projects/paladin/packages/codemirror-editor-experiment/src/decorations.ts ===
// @paladin/codemirror-editor-experiment/decorations.ts
import { ViewPlugin, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view'
import { EditorState, Range } from '@codemirror/state'

const backtickMark = Decoration.mark({ class: 'cm-backtick-block' })
const headingMark = Decoration.mark({ class: 'cm-heading-line' })

function buildBacktickDecorations(state: EditorState): DecorationSet {
  const text = state.doc.toString()
  const marks: Range<Decoration>[] = []
  const re = /```[\s\S]*?```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    marks.push(backtickMark.range(m.index, m.index + m[0].length))
  }
  return Decoration.set(marks)
}

function buildHeadingDecorations(state: EditorState): DecorationSet {
  const marks: Range<Decoration>[] = []
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    if (/^#{1,6} /.test(line.text)) {
      marks.push(headingMark.range(line.from, line.to))
    }
  }
  return Decoration.set(marks)
}

export const backtickHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: { state: EditorState }) {
      this.decorations = buildBacktickDecorations(view.state)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildBacktickDecorations(update.state)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

export const headingHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: { state: EditorState }) {
      this.decorations = buildHeadingDecorations(view.state)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildHeadingDecorations(update.state)
      }
    }
  },
  { decorations: (v) => v.decorations },
)


// === /home/kdog3682/projects/paladin/packages/codemirror-editor-experiment/src/theme.ts ===
// @paladin/codemirror-editor-experiment/theme.ts
import { EditorView } from '@codemirror/view'

export const theme = EditorView.theme({
  '&': {
    fontSize: '14px',
    fontFamily: "'Inconsolata', monospace",
    backgroundColor: '#ffffff',
    color: '#000000',
    height: '100vh',
    width: '100vw',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    padding: '40px 48px',
    caretColor: '#000000',
    lineHeight: '1.35 !important',
    color: '#000000',
  },
  '.cm-line': {
    lineHeight: '1.35 !important',
    padding: '0',
  },
  '.cm-cursor': {
    borderLeftColor: '#000000',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#dbeafe !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#bfdbfe !important',
  },
  '.cm-placeholder': {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  '.cm-scroller': {
    overflow: 'auto',
    height: '100%',
  },
  '.cm-tooltip-autocomplete': {
    fontFamily: "'Inconsolata', monospace",
    fontSize: '13px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '4px 12px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#eff6ff',
    color: '#1e40af',
  },
  '.cm-backtick-block': {
    color: '#3b82f6',
  },
  '.cm-heading-line': {
    fontWeight: 'bold',
    color: '#000000',
  },
})


// === /home/kdog3682/projects/paladin/packages/codemirror-editor-experiment/src/keybindings/smartEnter.ts ===
// @paladin/codemirror-editor-experiment/keybindings/smartEnter.ts
import { keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'

const ROMAN_ORDER = ['i', 'ii', 'iii', 'iv', 'v', 'vi']

function parseRoman(s: string): number | null {
  const idx = ROMAN_ORDER.indexOf(s.toLowerCase())
  return idx >= 0 ? idx + 1 : null
}

function toRoman(n: number): string {
  if (n < 1 || n > 6) return ROMAN_ORDER[ROMAN_ORDER.length - 1]
  return ROMAN_ORDER[n - 1]
}

function nextLetter(letter: string): string {
  if (letter === 'z') return 'aa'
  if (letter === 'Z') return 'AA'
  return String.fromCharCode(letter.charCodeAt(0) + 1)
}

type Pattern = {
  regex: RegExp
  // match groups: [full, indent, ...captures, content]
  // getNext returns the full prefix for the next line (indent + next marker + space)
  getNext: (m: RegExpMatchArray) => string
  // getMarkerLength returns how many chars the marker+space takes (without indent)
  // used to detect "empty" lines (only marker, no content)
  getContentIndex: number
}

const PATTERNS: Pattern[] = [
  {
    // // comment
    regex: /^(\s*)(\/\/ )(.*)$/,
    getNext: m => `${m[1]}// `,
    getContentIndex: 3,
  },
  {
    // # comment
    regex: /^(\s*)(# )(.*)$/,
    getNext: m => `${m[1]}# `,
    getContentIndex: 3,
  },
  {
    // [1] [22] etc
    regex: /^(\s*)\[(\d+)\] (.*)$/,
    getNext: m => `${m[1]}[${parseInt(m[2]) + 1}] `,
    getContentIndex: 3,
  },
  {
    // [a] [b] etc
    regex: /^(\s*)\[([a-zA-Z])\] (.*)$/,
    getNext: m => `${m[1]}[${nextLetter(m[2])}] `,
    getContentIndex: 3,
  },
  {
    // roman: i) ii) iii) iv) v) vi)
    regex: /^(\s*)(i{1,3}|iv|vi?)\) (.*)$/,
    getNext: m => {
      const val = parseRoman(m[2])
      if (val === null) return `${m[1]}${m[2]}) `
      return `${m[1]}${toRoman(val + 1)}) `
    },
    getContentIndex: 3,
  },
  {
    // lettered paren: a) b) — excluding roman overlap chars i, v
    regex: /^(\s*)([a-hj-uw-zA-Z])\) (.*)$/,
    getNext: m => `${m[1]}${nextLetter(m[2])}) `,
    getContentIndex: 3,
  },
  {
    // numbered dot: 1. 2.
    regex: /^(\s*)(\d+)\. (.*)$/,
    getNext: m => `${m[1]}${parseInt(m[2]) + 1}. `,
    getContentIndex: 3,
  },
  {
    // numbered paren: 1) 2)
    regex: /^(\s*)(\d+)\) (.*)$/,
    getNext: m => `${m[1]}${parseInt(m[2]) + 1}) `,
    getContentIndex: 3,
  },
  {
    // bullet: - or *
    regex: /^(\s*)([-*]) (.*)$/,
    getNext: m => `${m[1]}${m[2]} `,
    getContentIndex: 3,
  },
]

export function matchLine(line: string): { next: string, markerOnly: boolean } | null {
  for (const pattern of PATTERNS) {
    const match = line.match(pattern.regex)
    if (match) {
      const content = match[pattern.getContentIndex]
      return {
        next: pattern.getNext(match),
        markerOnly: content.trim() === '',
      }
    }
  }
  return null
}

const handleEnter: KeyBinding = {
  key: 'Enter',
  run(view: EditorView) {
    const { state } = view
    const { head } = state.selection.main
    const line = state.doc.lineAt(head)

    // only handle if cursor is at end of line
    if (head !== line.to) return false

    const result = matchLine(line.text)
    if (!result) {
      const indent = line.text.match(/^(\s*)/)?.[1] ?? ''
      if (!indent) return false
      const insert = '\n' + indent
      view.dispatch({
        changes: { from: head, insert },
        selection: { anchor: head + insert.length },
      })
      return true
    }

    if (result.markerOnly) {
      // empty list item — remove the marker, exit list
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      })
      return true
    }

    const insert = '\n' + result.next
    view.dispatch({
      changes: { from: head, insert },
      selection: { anchor: head + insert.length },
    })
    return true
  },
}

export function smartEnter(): Extension {
  return keymap.of([handleEnter])
}
