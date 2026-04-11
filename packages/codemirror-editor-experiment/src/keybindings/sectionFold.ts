// @paladin/codemirror-editor-experiment/keybindings/sectionFold.ts
import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { Extension, StateField, StateEffect, Range } from '@codemirror/state'
import { invertedEffects } from '@codemirror/commands'
import { inoremap } from './inoremap'

const HEADING_RE = /^## /
const STORAGE_KEY = 'paladin-section-folds'

// ── effects ──────────────────────────────────────────────────────────────────

interface FoldSpec {
  from: number   // headingLine.to — decoration starts here (after heading text)
  to: number     // end of section content
  title: string
}

const foldEffect = StateEffect.define<FoldSpec>()
const unfoldEffect = StateEffect.define<FoldSpec>()

// ── localStorage ──────────────────────────────────────────────────────────────

function getSavedFolds(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? new Set(JSON.parse(saved)) : new Set()
  } catch {
    return new Set()
  }
}

function saveFolds(titles: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(titles))
  } catch {}
}

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

const foldField = StateField.define<DecorationSet>({
  create(state) {
    const savedTitles = getSavedFolds()
    if (savedTitles.size === 0) return Decoration.none

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

    return ranges.length > 0 ? Decoration.set(ranges) : Decoration.none
  },

  update(folds, tr) {
    folds = folds.map(tr.changes)
    let changed = false

    for (const effect of tr.effects) {
      if (effect.is(foldEffect)) {
        folds = folds.update({
          add: [createFoldDecoration().range(effect.value.from, effect.value.to)],
        })
        changed = true
      } else if (effect.is(unfoldEffect)) {
        const { from, to } = effect.value
        folds = folds.update({ filter: (f, t) => !(f === from && t === to) })
        changed = true
      }
    }

    if (changed) {
      const foldedTitles: string[] = []
      folds.between(0, tr.state.doc.length, f => {
        const line = tr.state.doc.lineAt(f)
        const title = line.text.replace(/^## /, '')
        if (title) foldedTitles.push(title)
      })
      saveFolds(foldedTitles)
    }

    return folds
  },

  provide: f => EditorView.decorations.from(f),
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

// ── atomic ranges (fixes multi-arrow-key traversal) ──────────────────────────

const foldAtomic = EditorView.atomicRanges.of(view =>
  view.state.field(foldField, false) ?? Decoration.none
)

// ── click to unfold ───────────────────────────────────────────────────────────

const foldClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement
    if (!target.classList.contains('cm-section-fold')) return false

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
    const folds = view.state.field(foldField)
    let found: FoldSpec | null = null

    folds.between(0, view.state.doc.length, (f, t) => {
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

/**
 * Finds a fold whose heading line contains the cursor.
 * Since fold.from = headingLine.to, lineAt(fold.from) returns the heading line.
 */
function getFoldAtCursor(view: EditorView): FoldSpec | null {
  const { state } = view
  const currentLineNo = state.doc.lineAt(state.selection.main.head).number
  const folds = state.field(foldField)
  let found: FoldSpec | null = null

  folds.between(0, state.doc.length, (f, t) => {
    const line = state.doc.lineAt(f)
    if (line.number === currentLineNo) {
      found = { from: f, to: t, title: line.text.replace(/^## /, '') }
      return false
    }
  })

  return found
}

/**
 * Strict: only folds the section if the cursor is ON the `## ` heading line.
 */
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

function toggleSectionFold(view: EditorView): void {
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
  return [foldField, foldHistory, foldAtomic, foldClickHandler, inoremap({ zf: toggleSectionFold })]
}
