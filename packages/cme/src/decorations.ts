// @paladin/cme/decorations.ts
import { ViewPlugin, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view'
import { EditorState, Range } from '@codemirror/state'

const backtickMark = Decoration.mark({ class: 'cm-backtick-block' })
const headingMark = Decoration.mark({ class: 'cm-heading-line' })
const headingHashMark = Decoration.mark({ class: 'cm-heading-hash' })
const angleBracketMark = Decoration.mark({ class: 'cm-angle-bracket' })
const dimMark = Decoration.mark({ class: 'cm-dim' })

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
    const hm = line.text.match(/^(#{1,6}) /)
    if (hm) {
      // highlight just the hashes with black background
      marks.push(headingHashMark.range(line.from, line.from + hm[1].length))
      // highlight only the text part (after the hashes)
      const textStart = line.from + hm[0].length
      if (textStart < line.to) marks.push(headingMark.range(textStart, line.to))
    }
  }
  return Decoration.set(marks, true)
}

function buildMiscDecorations(state: EditorState): DecorationSet {
  const marks: Range<Decoration>[] = []
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    const text = line.text

    // <> angle brackets — green
    const angleRe = /<>/g
    let m: RegExpExecArray | null
    while ((m = angleRe.exec(text)) !== null) {
      marks.push(angleBracketMark.range(line.from + m.index, line.from + m.index + 2))
    }

    // --- or longer horizontal rules — dim gray
    if (/^-{3,}\s*$/.test(text)) {
      marks.push(dimMark.range(line.from, line.to))
      continue
    }

    // // comments and # comments — dim gray
    const commentMatch = text.match(/^(\s*)(\/\/|#) /)
    if (commentMatch) {
      marks.push(dimMark.range(line.from, line.to))
    }
  }
  return Decoration.set(marks, true)
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

export const miscHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: { state: EditorState }) {
      this.decorations = buildMiscDecorations(view.state)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildMiscDecorations(update.state)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
