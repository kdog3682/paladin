import type { EditorView } from '@codemirror/view'

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

const BRACKET_PAIRS: Record<string, string> = {
  '{': '}',
  '[': ']',
  '(': ')',
}

const INDENT = '  '

type Pattern = {
  regex: RegExp
  // match groups: [full, indent, ...captures, content]
  // getNext returns the full prefix for the next line (indent + next marker + space)
  getNext: (m: RegExpMatchArray) => string
  // getContentIndex is the match group index holding the line content
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
    // bullet: - * • ◦ ▪ ▫ ■ □ ● ○ ‣
    regex: /^(\s*)([-*•◦▪▫■□●○‣]) (.*)$/,
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

export function smartEnter(view: EditorView): boolean {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const { head } = sel
  const line = state.doc.lineAt(head)

  // bracket handling: cursor immediately after an opening bracket
  if (head > 0) {
    const before = state.doc.sliceString(head - 1, head)
    const closer = BRACKET_PAIRS[before]
    if (closer) {
      const baseIndent = line.text.match(/^(\s*)/)?.[1] ?? ''
      const innerIndent = baseIndent + INDENT
      const after = state.doc.sliceString(head, head + 1)
      if (after === closer) {
        // matching pair right after cursor — expand onto three lines
        const insert = '\n' + innerIndent + '\n' + baseIndent
        view.dispatch({
          changes: { from: head, insert },
          selection: { anchor: head + 1 + innerIndent.length },
        })
        return true
      }
      // no immediate match — just indent one level
      const insert = '\n' + innerIndent
      view.dispatch({
        changes: { from: head, insert },
        selection: { anchor: head + insert.length },
      })
      return true
    }
  }

  if (head !== line.to) {
    const afterCursor = line.text.slice(head - line.from)
    if (/^\s+$/.test(afterCursor)) {
      // only trailing spaces after cursor — delete them and treat as end-of-line
      const lineTextTrimmed = line.text.slice(0, head - line.from)
      const result2 = matchLine(lineTextTrimmed)
      const nextPrefix = result2 && !result2.markerOnly ? result2.next : (lineTextTrimmed.match(/^(\s*)/)?.[1] ?? '')
      const insert = '\n' + nextPrefix
      view.dispatch({
        changes: { from: head, to: line.to, insert },
        selection: { anchor: head + insert.length },
      })
      return true
    }
    // cursor in middle of real content: preserve indent only
    const indent = line.text.match(/^(\s*)/)?.[1] ?? ''
    if (!indent) return false
    const insert = '\n' + indent
    view.dispatch({
      changes: { from: head, insert },
      selection: { anchor: head + insert.length },
    })
    return true
  }

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
}
