// Tab completion of words visible in the viewport (camel/Pascal/dash-aware initials)
import { keymap, EditorView } from '@codemirror/view'
import {
  autocompletion,
  startCompletion,
  acceptCompletion,
  moveCompletionSelection,
  closeCompletion,
  currentCompletions,
} from '@codemirror/autocomplete'
import type { CompletionContext, Completion } from '@codemirror/autocomplete'
import type { EditorState, Extension } from '@codemirror/state'

function isPascal(w: string): boolean {
  return /^[A-Z][a-z]/.test(w)
}

function isCamel(w: string): boolean {
  return /^[a-z].*[A-Z]/.test(w)
}

function isDash(w: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)+$/.test(w)
}

function hasStructure(w: string): boolean {
  return isPascal(w) || isCamel(w) || isDash(w)
}

function getInitials(w: string): string {
  if (isDash(w)) {
    return w
      .split('-')
      .map(p => p[0]?.toLowerCase() ?? '')
      .join('')
  }
  const initials: string[] = []
  for (let i = 0; i < w.length; i++) {
    if (i === 0 || /[A-Z]/.test(w[i])) {
      initials.push(w[i].toLowerCase())
    }
  }
  return initials.join('')
}

type MatchType = 'pascal' | 'camel' | 'dash' | 'prefix'

const MATCH_PRIORITY: Record<MatchType, number> = {
  pascal: 0,
  prefix: 1,
  camel: 2,
  dash: 3,
}

function getMatchType(word: string, prefix: string): MatchType | null {
  if (word.toLowerCase().startsWith(prefix)) {
    return isPascal(word) ? 'pascal' : 'prefix'
  }
  if (hasStructure(word) && getInitials(word).startsWith(prefix)) {
    if (isPascal(word)) return 'pascal'
    if (isDash(word)) return 'dash'
    return 'camel'
  }
  return null
}

type Candidate = { word: string; distance: number }

/** every distinct word in the viewport with its distance (in characters) to the cursor */
function viewportWords(view: EditorView): Candidate[] {
  const head = view.state.selection.main.head
  const best = new Map<string, number>()
  for (const r of view.visibleRanges) {
    const text = view.state.doc.sliceString(r.from, r.to)
    for (const m of text.matchAll(/[a-zA-Z][\w]*(?:-[a-zA-Z][\w]*)*/g)) {
      const at = r.from + m.index!
      const distance = at > head ? at - head : head - (at + m[0].length)
      const prev = best.get(m[0])
      if (prev === undefined || Math.abs(distance) < prev) best.set(m[0], Math.abs(distance))
    }
  }
  return [...best].map(([word, distance]) => ({ word, distance }))
}

function getViewportCompletions(view: EditorView, prefix: string): Completion[] {
  const words = viewportWords(view)

  type Match = { label: string; priority: number }
  const matches: Match[] = []

  for (const { word } of words) {
    if (word.length < 5) continue
    if (!hasStructure(word) && word.length < 10) continue

    const mt = getMatchType(word, prefix)
    if (mt === null) continue

    matches.push({ label: word, priority: MATCH_PRIORITY[mt] })
  }

  if (matches.length > 0) {
    matches.sort((a, b) => a.priority - b.priority || a.label.length - b.label.length)
    return matches.map(m => ({ label: m.label }))
  }

  // nothing structured matched: fall back to any longish plain word that starts with the
  // prefix (`r` / `ret` -> retrieve), nearest to the cursor first
  return words
    .filter(({ word }) => word.length >= 5 && word.toLowerCase() !== prefix && word.toLowerCase().startsWith(prefix))
    .sort((a, b) => a.distance - b.distance || a.word.length - b.word.length)
    .map(({ word }) => ({ label: word }))
}

/** the tooltip: compact, rounded, with the 1-9 quick-pick digit in front of each option */
const completionTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
    padding: '2px',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': {
    fontFamily: 'inherit',
    maxHeight: '12em',
  },
  '.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    padding: '1px 8px 1px 6px',
    borderRadius: '4px',
    color: '#111827',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: '#dbeafe',
    color: '#111827',
  },
  '.cm-completionIcon': { display: 'none' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '600' },
  '.cm-completionIndex': { color: '#9ca3af', fontSize: '0.85em', minWidth: '1ch', textAlign: 'right' },
})

const indexOption = {
  position: 10,
  render(completion: Completion, state: EditorState) {
    const el = document.createElement('span')
    el.className = 'cm-completionIndex'
    const i = currentCompletions(state).indexOf(completion)
    el.textContent = i >= 0 && i < 9 ? String(i + 1) : ''
    return el
  },
}

export function tabCompletion(): Extension {
  let currentView: EditorView | null = null

  function source(ctx: CompletionContext) {
    if (!ctx.explicit || !currentView) return null
    const word = ctx.matchBefore(/[a-z]+/)
    if (!word) return null
    const options = getViewportCompletions(currentView, word.text)
    if (options.length === 0) return null
    return { from: word.from, options, filter: false }
  }

  function handleNumber(view: EditorView, n: number): boolean {
    const completions = currentCompletions(view.state)
    if (completions.length === 0) return false
    const idx = n - 1
    if (idx >= completions.length) return false

    const completion = completions[idx]
    const { state } = view
    const pos = state.selection.main.head
    const line = state.doc.lineAt(pos)
    const before = line.text.slice(0, pos - line.from)
    const m = before.match(/[a-z]+$/)
    const from = m ? pos - m[0].length : pos
    const insert = typeof completion.apply === 'string' ? completion.apply : completion.label

    view.dispatch({
      changes: { from, to: pos, insert },
      selection: { anchor: from + insert.length },
    })
    closeCompletion(view)
    return true
  }

  function handleTab(view: EditorView): boolean {
    if (acceptCompletion(view)) return true

    const { state } = view
    const pos = state.selection.main.head
    const line = state.doc.lineAt(pos)
    const before = line.text.slice(0, pos - line.from)
    const m = before.match(/[a-z]+$/)
    if (!m) return false
    const prefix = m[0]

    const options = getViewportCompletions(view, prefix)
    if (options.length === 0) return false

    if (options.length === 1) {
      const from = pos - prefix.length
      view.dispatch({
        changes: { from, to: pos, insert: options[0].label },
        selection: { anchor: from + options[0].label.length },
      })
      return true
    }

    startCompletion(view)
    return true
  }

  return [
    autocompletion({
      override: [source],
      activateOnTyping: false,
      defaultKeymap: false,
      icons: false,
      addToOptions: [indexOption],
    }),
    completionTheme,
    EditorView.updateListener.of(update => {
      currentView = update.view
    }),
    keymap.of([
      { key: 'Tab', run: handleTab },
      { key: 'Enter', run: acceptCompletion },
      { key: 'ArrowDown', run: moveCompletionSelection(true) },
      { key: 'ArrowUp', run: moveCompletionSelection(false) },
      { key: 'Escape', run: closeCompletion },
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({
        key: String(n),
        run: (view: EditorView) => handleNumber(view, n),
      })),
    ]),
  ]
}
