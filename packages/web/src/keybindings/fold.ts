// @paladin/editor/section-fold.ts
import { EditorView, ViewPlugin } from '@codemirror/view'
import { Extension, StateField, Facet, EditorState } from '@codemirror/state'
import { invertedEffects } from '@codemirror/commands'
import {
  codeFolding,
  foldService,
  foldEffect,
  unfoldEffect,
  foldedRanges,
  toggleFold,
} from '@codemirror/language'

const HEADING_RE = /^## /

// ── facets ────────────────────────────────────────────────────────────────────

export const initialFoldsFacet = Facet.define<string[], string[]>({
  combine: xs => xs.flat(),
})

export const foldsFacet = Facet.define<string[], string[]>({
  combine: xs => xs.flat(),
})

// ── section range ─────────────────────────────────────────────────────────────

function sectionRange(state: EditorState, lineStart: number): { from: number; to: number } | null {
  const line = state.doc.lineAt(lineStart)
  if (!HEADING_RE.test(line.text)) return null

  const from = line.to
  let to = state.doc.length
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const l = state.doc.line(n)
    if (HEADING_RE.test(l.text)) {
      to = l.from - 1
      break
    }
  }
  return from >= to ? null : { from, to }
}

// tells codeFolding what's foldable at each line (heading -> its section)
const sectionFoldService = foldService.of((state, lineStart) => sectionRange(state, lineStart))

// ── folding (decorations, atomic ranges, placeholder) all handled here ────────

const folding = codeFolding({
  placeholderDOM(_view, onclick) {
    const dot = document.createElement('span')
    dot.className = 'cm-section-fold'
    dot.style.cssText =
      'display:inline-block;width:8px;height:8px;background:#f5c518;border-radius:2px;margin-left:6px;vertical-align:middle;cursor:pointer;'
    dot.onclick = onclick // built-in unfold-on-click (drop this line if unwanted)
    return dot
  },
})

// ── fold changes participate in undo/redo ─────────────────────────────────────

const foldHistory = invertedEffects.of(tr => {
  const effects = []
  for (const e of tr.effects) {
    if (e.is(foldEffect)) effects.push(unfoldEffect.of(e.value))
    else if (e.is(unfoldEffect)) effects.push(foldEffect.of(e.value))
  }
  return effects
})

// ── expose folded titles via foldsFacet ───────────────────────────────────────

function foldedTitles(state: EditorState): string[] {
  const titles: string[] = []
  const cur = foldedRanges(state).iter()
  while (cur.value) {
    const title = state.doc.lineAt(cur.from).text.replace(/^## /, '')
    if (title) titles.push(title)
    cur.next()
  }
  return titles
}

const foldTitles = StateField.define<string[]>({
  create: foldedTitles,
  update(value, tr) {
    const touched = tr.effects.some(e => e.is(foldEffect) || e.is(unfoldEffect))
    return tr.docChanged || touched ? foldedTitles(tr.state) : value
  },
  provide: f => foldsFacet.from(f),
})

// ── apply initial folds from titles ───────────────────────────────────────────

const applyInitialFolds = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      const titles = new Set(view.state.facet(initialFoldsFacet))
      if (titles.size === 0) return

      const effects = []
      for (let n = 1; n <= view.state.doc.lines; n++) {
        const line = view.state.doc.line(n)
        if (!HEADING_RE.test(line.text)) continue
        if (!titles.has(line.text.replace(/^## /, ''))) continue
        const range = sectionRange(view.state, line.from)
        if (range) effects.push(foldEffect.of(range))
      }
      if (effects.length) queueMicrotask(() => view.dispatch({ effects }))
    }
  }
)

// ── command ───────────────────────────────────────────────────────────────────

export function toggleSectionFold(view: EditorView): void {
  toggleFold(view)
}

// ── extension ─────────────────────────────────────────────────────────────────

export function sectionFold(): Extension {
  return [folding, sectionFoldService, foldHistory, foldTitles, applyInitialFolds]
}
