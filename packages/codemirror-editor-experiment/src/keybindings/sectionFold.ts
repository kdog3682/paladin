// @paladin/codemirror-editor-experiment/keybindings/sectionFold.ts
import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { Extension, StateField, StateEffect } from '@codemirror/state'
import { inoremap } from './inoremap'

const HEADING_RE = /^## /

interface FoldRange {
  from: number
  to: number
}

const toggleFoldEffect = StateEffect.define<FoldRange>()

class FoldWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.textContent = ' ···'
    span.className = 'cm-section-fold'
    return span
  }
  ignoreEvent(): boolean {
    return false
  }
}

const foldField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(folds, tr) {
    folds = folds.map(tr.changes)
    for (const effect of tr.effects) {
      if (!effect.is(toggleFoldEffect)) continue
      const { from, to } = effect.value
      let found = false
      folds.between(from, to, (f, t) => {
        if (f === from && t === to) found = true
      })
      if (found) {
        folds = folds.update({ filter: (f, t) => !(f === from && t === to) })
      } else {
        folds = folds.update({
          add: [
            Decoration.replace({
              widget: new FoldWidget(),
              block: true,
              inclusive: true,
            }).range(from, to),
          ],
        })
      }
    }
    return folds
  },
  provide: f => EditorView.decorations.from(f),
})

/**
 * From the cursor, searches upward for the nearest `## ` heading (the region
 * start) and downward for the next `## ` heading (the region end). Returns
 * the range of content between them, or null if no heading is found.
 */
function getSectionRange(view: EditorView): FoldRange | null {
  const { state } = view
  const currentLine = state.doc.lineAt(state.selection.main.head)

  let headingLine = null
  for (let n = currentLine.number; n >= 1; n--) {
    const line = state.doc.line(n)
    if (HEADING_RE.test(line.text)) {
      headingLine = line
      break
    }
  }
  if (!headingLine) return null

  // from = right after the heading text (before its trailing \n)
  const from = headingLine.to

  // to = just before the \n that precedes the next heading (exclusive)
  let to = state.doc.length
  for (let n = headingLine.number + 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (HEADING_RE.test(line.text)) {
      to = line.from - 1
      break
    }
  }

  if (from >= to) return null
  return { from, to }
}

function toggleSectionFold(view: EditorView): void {
  const range = getSectionRange(view)
  if (range) view.dispatch({ effects: toggleFoldEffect.of(range) })
}

export function sectionFold(): Extension {
  return [foldField, inoremap('z', { f: toggleSectionFold })]
}
