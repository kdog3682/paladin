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
