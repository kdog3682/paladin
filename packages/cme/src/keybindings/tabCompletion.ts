// @paladin/codemirror-editor-experiment/keybindings/tabCompletion.ts
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
import { Extension } from '@codemirror/state'

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

function getViewportCompletions(view: EditorView, prefix: string): Completion[] {
  const text = view.visibleRanges
    .map(r => view.state.doc.sliceString(r.from, r.to))
    .join(' ')

  const words = text.match(/[a-zA-Z][\w]*(?:-[a-zA-Z][\w]*)*/g) ?? []
  const unique = [...new Set(words)]

  type Match = { label: string; priority: number }
  const matches: Match[] = []

  for (const word of unique) {
    if (word.length < 5) continue
    if (!hasStructure(word) && word.length < 10) continue

    const mt = getMatchType(word, prefix)
    if (mt === null) continue

    matches.push({ label: word, priority: MATCH_PRIORITY[mt] })
  }

  matches.sort((a, b) => a.priority - b.priority || a.label.length - b.label.length)
  return matches.map(m => ({ label: m.label }))
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
    }),
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
