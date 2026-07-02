import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { Extension, StateField, StateEffect, Facet, Range } from '@codemirror/state'
import { invertedEffects } from '@codemirror/commands'

const HEADING_RE = /^## /

// ── facets ────────────────────────────────────────────────────────────────────

export const initialFoldsFacet = Facet.define<string[], string[]>({
  combine: xs => xs.flat(),
})

export const foldsFacet = Facet.define<string[], string[]>({
  combine: xs => xs.flat(),
})

// ── effects ──────────────────────────────────────────────────────────────────

interface FoldSpec {
  from: number
  to: number
  title: string
}

const foldEffect = StateEffect.define<FoldSpec>()
const unfoldEffect = StateEffect.define<FoldSpec>()

// ── widget ───────────────────────────────────────────────────────────────────

class FoldWidget extends WidgetType {
  eq(_other: FoldWidget): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const dot = document.createElement('span')
    dot.className = 'cm-section-fold'
    dot.style.cssText =
      'display:inline-block;width:8px;height:8px;background:#f5c518;border-radius:2px;margin-left:6px;vertical-align:middle;cursor:pointer;'
    return dot
  }

  ignoreEvent(): boolean {
    return true
  }
}

function createFoldDecoration(): Decoration {
  return Decoration.replace({
    widget: new FoldWidget(),
    inclusive: true,
  })
}

// ── state field ───────────────────────────────────────────────────────────────

interface FoldState {
  decorations: DecorationSet
  titles: string[]
}

function titlesFromDecorations(decorations: DecorationSet, state: { doc: any }): string[] {
  const titles: string[] = []
  decorations.between(0, state.doc.length, f => {
    const line = state.doc.lineAt(f)
    const title = line.text.replace(/^## /, '')
    if (title) titles.push(title)
  })
  return titles
}

const foldField = StateField.define<FoldState>({
  create(state) {
    const savedTitles = new Set(state.facet(initialFoldsFacet))
    if (savedTitles.size === 0) return { decorations: Decoration.none, titles: [] }

    const ranges: Range<Decoration>[] = []
    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i)
      if (!HEADING_RE.test(line.text)) continue
      const title = line.text.replace(/^## /, '')
      if (!savedTitles.has(title)) continue

      let to = state.doc.length
      for (let j = i + 1; j <= state.doc.lines; j++) {
        if (HEADING_RE.test(state.doc.line(j).text)) {
          to = state.doc.line(j).from - 1
          break
        }
      }
      const from = line.to
      if (from < to) ranges.push(createFoldDecoration().range(from, to))
    }

    const decorations = ranges.length > 0 ? Decoration.set(ranges) : Decoration.none
    return { decorations, titles: titlesFromDecorations(decorations, state) }
  },

  update({ decorations, titles }, tr) {
    decorations = decorations.map(tr.changes)
    let changed = false

    for (const effect of tr.effects) {
      if (effect.is(foldEffect)) {
        decorations = decorations.update({
          add: [createFoldDecoration().range(effect.value.from, effect.value.to)],
        })
        changed = true
      } else if (effect.is(unfoldEffect)) {
        const { from, to } = effect.value
        decorations = decorations.update({ filter: (f, t) => !(f === from && t === to) })
        changed = true
      }
    }

    if (changed) titles = titlesFromDecorations(decorations, tr.state)
    return { decorations, titles }
  },

  provide: f => [
    EditorView.decorations.from(f, s => s.decorations),
    foldsFacet.from(f, s => s.titles),
  ],
})

// ── history ───────────────────────────────────────────────────────────────────

const foldHistory = invertedEffects.of(tr => {
  const effects: StateEffect<any>[] = []
  for (const e of tr.effects) {
    if (e.is(foldEffect)) effects.push(unfoldEffect.of(e.value))
    else if (e.is(unfoldEffect)) effects.push(foldEffect.of(e.value))
  }
  return effects
})

// ── atomic ranges ─────────────────────────────────────────────────────────────

const foldAtomic = EditorView.atomicRanges.of(view =>
  view.state.field(foldField, false)?.decorations ?? Decoration.none
)

// ── click to unfold ───────────────────────────────────────────────────────────

const foldClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement
    if (!target.classList.contains('cm-section-fold')) return false

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
    const { decorations } = view.state.field(foldField)
    let found: FoldSpec | null = null

    decorations.between(0, view.state.doc.length, (f, t) => {
      if (found) return false
      if (pos >= f && pos <= t) {
        found = { from: f, to: t, title: view.state.doc.lineAt(f).text.replace(/^## /, '') }
        return false
      }
    })

    if (found) {
      view.dispatch({ effects: unfoldEffect.of(found) })
      event.preventDefault()
      return true
    }
    return false
  },
})

// ── helpers ───────────────────────────────────────────────────────────────────

function getFoldAtCursor(view: EditorView): FoldSpec | null {
  const { state } = view
  const currentLineNo = state.doc.lineAt(state.selection.main.head).number
  const { decorations } = state.field(foldField)
  let found: FoldSpec | null = null

  decorations.between(0, state.doc.length, (f, t) => {
    const line = state.doc.lineAt(f)
    if (line.number === currentLineNo) {
      found = { from: f, to: t, title: line.text.replace(/^## /, '') }
      return false
    }
  })

  return found
}

function getSectionRange(view: EditorView): FoldSpec | null {
  const { state } = view
  const currentLine = state.doc.lineAt(state.selection.main.head)

  if (!HEADING_RE.test(currentLine.text)) return null

  const title = currentLine.text.replace(/^## /, '')
  const from = currentLine.to

  let to = state.doc.length
  for (let n = currentLine.number + 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (HEADING_RE.test(line.text)) {
      to = line.from - 1
      break
    }
  }

  if (from >= to) return null
  return { from, to, title }
}

// ── command ───────────────────────────────────────────────────────────────────

export function toggleSectionFold(view: EditorView): void {
  const existing = getFoldAtCursor(view)
  if (existing) {
    view.dispatch({ effects: unfoldEffect.of(existing) })
    return
  }

  const spec = getSectionRange(view)
  if (spec) view.dispatch({ effects: foldEffect.of(spec) })
}

// ── extension ─────────────────────────────────────────────────────────────────

export function sectionFold(): Extension {
  return [foldField, foldHistory, foldAtomic, foldClickHandler]
}
