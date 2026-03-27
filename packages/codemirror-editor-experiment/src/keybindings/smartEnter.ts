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
    const sel = state.selection.main
    if (!sel.empty) return false
    const { head } = sel
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
