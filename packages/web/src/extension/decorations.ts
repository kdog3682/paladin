import { ViewPlugin, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view'
import { EditorState, Range } from '@codemirror/state'

// ---- programmable rule definitions ----------------------------------

// Multi-line / whole-doc regex rules. `group` selects which capture
// group gets the mark (0 = whole match). Add new block-level rules here.
interface BlockRule {
  class: string
  regex: RegExp // must be global
  group?: number
}

const blockRules: BlockRule[] = [
  // fence must start the line (optional leading spaces), spaces excluded from the mark
  { class: 'cm-backtick-block', regex: /^ *(```[\s\S]*?```)/gm, group: 1 },
  { class: 'cm-wish-block', regex: /^ *wish\s*\{([\s\S]*?)\}/gm, group: 1 },
  // <asd> or <asd?>
  { class: 'cm-angle-bracket', regex: /<\w+\??>/g },
]

// Per-line rules, as objects: `match` tests the line and returns match
// data (or a falsy value to skip), `run` turns that into spans. Add new
// line-level rules here.
interface LineSpan {
  class: string
  from: number
  to: number
}
interface LineRule {
  match: (text: string) => any
  run: (text: string, m: any) => LineSpan[]
}

const lineRules: LineRule[] = [
  // headings: hash marks + rest of line get different classes
  {
    match: (text) => text.match(/^(#{1,6}) /),
    run: (text, m) => {
      const spans: LineSpan[] = [{ class: 'cm-heading-hash', from: 0, to: m[1].length }]
      if (m[0].length < text.length) {
        spans.push({ class: 'cm-heading-line', from: m[0].length, to: text.length })
      }
      return spans
    },
  },
  // horizontal rules ---
  {
    match: (text) => /^-{3,}\s*$/.test(text),
    run: (text) => [{ class: 'cm-dim', from: 0, to: text.length }],
  },
  // // or # comments — must start the line, optionally preceded by spaces
  {
    match: (text) => text.match(/^ *(\/\/|#) /),
    run: (text) => [{ class: 'cm-dim', from: 0, to: text.length }],
  },
]

// ---- single-pass builder ---------------------------------------------

function buildDecorations(state: EditorState): DecorationSet {
  const text = state.doc.toString()
  const marks: Range<Decoration>[] = []

  for (const rule of blockRules) {
    const mark = Decoration.mark({ class: rule.class })
    rule.regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.regex.exec(text)) !== null) {
      const group = rule.group ?? 0
      const matched = m[group]
      if (matched === undefined) continue
      const start = group === 0 ? m.index : text.indexOf(matched, m.index)
      marks.push(mark.range(start, start + matched.length))
    }
  }

  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    for (const rule of lineRules) {
      const m = rule.match(line.text)
      if (!m) continue
      for (const span of rule.run(line.text, m)) {
        marks.push(Decoration.mark({ class: span.class }).range(line.from + span.from, line.from + span.to))
      }
    }
  }

  return Decoration.set(marks, true) // sort:true, since sources are interleaved
}

export const syntaxHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: { state: EditorState }) {
      this.decorations = buildDecorations(view.state)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.state)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
