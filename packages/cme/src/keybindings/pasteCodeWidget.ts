// @paladin/cme/keybindings/pasteCodeWidget.ts
import {
  EditorView,
  Decoration,
  DecorationSet,
  WidgetType,
} from '@codemirror/view'
import { Extension, StateField, StateEffect } from '@codemirror/state'
import { generateDocs, type DocInfo } from '../docs/generateDocs'

/* ── state: tracked code blocks ── */

interface CodeBlock {
  from: number
  to: number
  code: string
  docs: DocInfo
  collapsed: boolean
}

const addCodeBlock = StateEffect.define<CodeBlock>()
const removeCodeBlock = StateEffect.define<number>()
const toggleCodeBlock = StateEffect.define<number>()

function mapBlocks(blocks: CodeBlock[], tr: { changes: any, startState: any, newDoc: any }): CodeBlock[] {
  const oldLen = tr.startState.doc.length
  const newLen = tr.newDoc.length
  return blocks.reduce<CodeBlock[]>((acc, b) => {
    const from = tr.changes.mapPos(Math.min(b.from, oldLen), 1)
    const to = tr.changes.mapPos(Math.min(b.to, oldLen), -1)
    if (from < to && to <= newLen) {
      acc.push({ ...b, from, to })
    }
    return acc
  }, [])
}

/* ── chip widget (inline, placed as a line decoration above the block) ── */

class CodeBlockChip extends WidgetType {
  constructor(private readonly block: CodeBlock) {
    super()
  }

  eq(other: CodeBlockChip) {
    return this.block.from === other.block.from && this.block.collapsed === other.block.collapsed
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-code-block-chip-line'

    const chip = document.createElement('span')
    chip.className = 'cm-code-block-chip'

    const icon = document.createElement('span')
    icon.className = 'cm-code-block-chip-icon'
    icon.textContent = this.block.collapsed ? '▶' : '▼'

    const label = document.createElement('span')
    label.className = 'cm-code-block-chip-label'
    const { symbols, lineCount } = this.block.docs
    const symbolText = symbols.length
      ? symbols.slice(0, 3).map(s => s.name).join(', ')
      : 'code block'
    label.textContent = `${symbolText}  (${lineCount} lines)`

    chip.appendChild(icon)
    chip.appendChild(label)

    // hover → tooltip
    chip.addEventListener('mouseenter', () => showTooltip(chip, this.block.docs))
    chip.addEventListener('mouseleave', () => hideTooltip())

    // click → toggle collapse / expand
    chip.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.dispatch({ effects: toggleCodeBlock.of(this.block.from) })
    })

    // right-click → modal
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      hideTooltip()
      openModal(view, this.block)
    })

    wrap.appendChild(chip)
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

/* ── build decorations ── */

function buildDecorations(blocks: CodeBlock[]): DecorationSet {
  const sorted = [...blocks].sort((a, b) => a.from - b.from)
  const decos: any[] = []

  for (const block of sorted) {
    // widget above the block
    decos.push(
      Decoration.widget({
        widget: new CodeBlockChip(block),
        block: true,
      }).range(block.from),
    )

    // if collapsed, hide all lines in the range
    if (block.collapsed) {
      decos.push(
        Decoration.replace({}).range(block.from, block.to),
      )
    }
  }

  return Decoration.set(decos, true)
}

/* ── state field ── */

const codeBlockField = StateField.define<{ blocks: CodeBlock[], decorations: DecorationSet }>({
  create: () => ({ blocks: [], decorations: Decoration.none }),
  update({ blocks }, tr) {
    let next = blocks

    for (const effect of tr.effects) {
      if (effect.is(addCodeBlock)) {
        next = [...next, effect.value]
      }
      if (effect.is(removeCodeBlock)) {
        next = next.filter(b => b.from !== effect.value)
      }
      if (effect.is(toggleCodeBlock)) {
        next = next.map(b =>
          b.from === effect.value ? { ...b, collapsed: !b.collapsed } : b,
        )
      }
    }

    if (tr.docChanged && next.length) {
      next = mapBlocks(next, tr)
    }

    return { blocks: next, decorations: buildDecorations(next) }
  },
  provide: f => EditorView.decorations.from(f, val => val.decorations),
})

/* ── tooltip (hover) ── */

let tooltipEl: HTMLDivElement | null = null

function showTooltip(anchor: HTMLElement, docs: DocInfo) {
  hideTooltip()

  tooltipEl = document.createElement('div')
  tooltipEl.className = 'cm-code-block-tooltip'

  const title = document.createElement('div')
  title.className = 'cm-code-block-tooltip-title'
  title.textContent = `${docs.symbols.length} symbol${docs.symbols.length !== 1 ? 's' : ''} detected`
  tooltipEl.appendChild(title)

  for (const sym of docs.symbols.slice(0, 6)) {
    const row = document.createElement('div')
    row.className = 'cm-code-block-tooltip-row'
    row.textContent = `${sym.kind}  ${sym.name}`
    tooltipEl.appendChild(row)
  }

  document.body.appendChild(tooltipEl)

  const rect = anchor.getBoundingClientRect()
  tooltipEl.style.left = `${rect.left}px`
  tooltipEl.style.top = `${rect.bottom + 4}px`
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.remove()
    tooltipEl = null
  }
}

/* ── modal (click) ── */

function openModal(view: EditorView, block: CodeBlock) {
  const existing = document.querySelector('.cm-code-block-modal-overlay')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'cm-code-block-modal-overlay'

  const modal = document.createElement('div')
  modal.className = 'cm-code-block-modal'

  // header
  const header = document.createElement('div')
  header.className = 'cm-code-block-modal-header'

  const headerTitle = document.createElement('span')
  headerTitle.textContent = 'Pasted Code'
  header.appendChild(headerTitle)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'cm-code-block-modal-close'
  closeBtn.textContent = '✕'
  closeBtn.addEventListener('click', () => {
    overlay.remove()
    document.removeEventListener('keydown', onKeyDown)
  })
  header.appendChild(closeBtn)

  modal.appendChild(header)

  // docs section
  if (block.docs.symbols.length) {
    const docsSection = document.createElement('div')
    docsSection.className = 'cm-code-block-modal-docs'

    const docsTitle = document.createElement('div')
    docsTitle.className = 'cm-code-block-modal-docs-title'
    docsTitle.textContent = 'Symbols'
    docsSection.appendChild(docsTitle)

    for (const sym of block.docs.symbols) {
      const row = document.createElement('div')
      row.className = 'cm-code-block-modal-sym'

      const badge = document.createElement('span')
      badge.className = `cm-code-block-modal-badge cm-code-block-modal-badge--${sym.kind}`
      badge.textContent = sym.kind
      row.appendChild(badge)

      const name = document.createElement('span')
      name.textContent = sym.name
      row.appendChild(name)

      docsSection.appendChild(row)
    }

    modal.appendChild(docsSection)
  }

  // code preview
  const pre = document.createElement('pre')
  pre.className = 'cm-code-block-modal-code'

  const code = document.createElement('code')
  code.textContent = block.code
  pre.appendChild(code)
  modal.appendChild(pre)

  // actions
  const actions = document.createElement('div')
  actions.className = 'cm-code-block-modal-actions'

  const removeBtn = document.createElement('button')
  removeBtn.className = 'cm-code-block-modal-btn'
  removeBtn.textContent = 'Remove widget'
  removeBtn.addEventListener('click', () => {
    view.dispatch({ effects: removeCodeBlock.of(block.from) })
    overlay.remove()
    document.removeEventListener('keydown', onKeyDown)
  })
  actions.appendChild(removeBtn)

  const copyBtn = document.createElement('button')
  copyBtn.className = 'cm-code-block-modal-btn cm-code-block-modal-btn--secondary'
  copyBtn.textContent = 'Copy'
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(block.code)
    copyBtn.textContent = 'Copied!'
    setTimeout(() => { copyBtn.textContent = 'Copy' }, 1500)
  })
  actions.appendChild(copyBtn)

  modal.appendChild(actions)
  overlay.appendChild(modal)

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove()
      document.removeEventListener('keydown', onKeyDown)
    }
  })

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove()
      document.removeEventListener('keydown', onKeyDown)
    }
  }
  document.addEventListener('keydown', onKeyDown)

  document.body.appendChild(overlay)
}

/* ── paste handler ── */

function looksLikeCode(text: string): boolean {
  if (!text.includes('\n')) return false

  const lines = text.split('\n')

  const indentedLines = lines.filter(l => /^(\s{2,}|\t)/.test(l))
  if (indentedLines.length >= 2) return true

  const codeChars = (text.match(/[{}();=><[\]]/g) ?? []).length
  if (codeChars / text.length > 0.04) return true

  if (/\b(function|const|let|var|return|import|export|class|def|if|else|for|while)\b/.test(text)) return true

  return false
}

const pasteHandler = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData('text/plain')
    if (!text || !looksLikeCode(text)) return false

    event.preventDefault()

    const { from, to } = view.state.selection.main
    const trimmed = text.trimEnd()
    const docs = generateDocs(trimmed)

    view.dispatch({
      changes: { from, to, insert: trimmed },
      effects: addCodeBlock.of({
        from,
        to: from + trimmed.length,
        code: trimmed,
        docs,
        collapsed: true,
      }),
    })

    return true
  },
})

/* ── theme ── */

const theme = EditorView.baseTheme({
  '.cm-code-block-chip-line': {
    padding: '2px 0',
  },
  '.cm-code-block-chip': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '4px',
    background: '#1e1e2e',
    border: '1px solid #313244',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#cdd6f4',
    transition: 'border-color 150ms, background 150ms',
    '&:hover': {
      borderColor: '#89b4fa',
      background: '#181825',
    },
  },
  '.cm-code-block-chip-icon': {
    color: '#89b4fa',
    fontWeight: 'bold',
    fontSize: '10px',
  },
  '.cm-code-block-chip-label': {
    color: '#a6adc8',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '.cm-code-block-tooltip': {
    position: 'fixed',
    zIndex: '10000',
    background: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#cdd6f4',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    maxWidth: '280px',
  },
  '.cm-code-block-tooltip-title': {
    fontWeight: '600',
    marginBottom: '4px',
    color: '#89b4fa',
  },
  '.cm-code-block-tooltip-row': {
    padding: '1px 0',
    color: '#a6adc8',
    fontFamily: 'monospace',
    fontSize: '11px',
  },
  '.cm-code-block-modal-overlay': {
    position: 'fixed',
    inset: '0',
    zIndex: '10001',
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  '.cm-code-block-modal': {
    background: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: '8px',
    width: '560px',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  '.cm-code-block-modal-header': {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #313244',
    fontWeight: '600',
    color: '#cdd6f4',
  },
  '.cm-code-block-modal-close': {
    background: 'none',
    border: 'none',
    color: '#6c7086',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px',
    '&:hover': { color: '#cdd6f4' },
  },
  '.cm-code-block-modal-docs': {
    padding: '12px 16px',
    borderBottom: '1px solid #313244',
  },
  '.cm-code-block-modal-docs-title': {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6c7086',
    marginBottom: '8px',
  },
  '.cm-code-block-modal-sym': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 0',
    fontSize: '13px',
    color: '#cdd6f4',
    fontFamily: 'monospace',
  },
  '.cm-code-block-modal-badge': {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '3px',
    textTransform: 'uppercase',
    fontWeight: '600',
    background: '#313244',
    color: '#a6adc8',
  },
  '.cm-code-block-modal-badge--function': { color: '#89b4fa', background: '#1e3a5f' },
  '.cm-code-block-modal-badge--class': { color: '#f9e2af', background: '#3d3520' },
  '.cm-code-block-modal-badge--variable': { color: '#a6e3a1', background: '#1e3a2a' },
  '.cm-code-block-modal-badge--import': { color: '#cba6f7', background: '#2d1f4e' },
  '.cm-code-block-modal-badge--type': { color: '#fab387', background: '#3d2a1a' },
  '.cm-code-block-modal-code': {
    margin: '0',
    padding: '12px 16px',
    fontSize: '12px',
    lineHeight: '1.5',
    color: '#cdd6f4',
    background: '#181825',
    overflow: 'auto',
    maxHeight: '300px',
    fontFamily: 'monospace',
  },
  '.cm-code-block-modal-actions': {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid #313244',
    justifyContent: 'flex-end',
  },
  '.cm-code-block-modal-btn': {
    padding: '6px 14px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    background: '#89b4fa',
    color: '#1e1e2e',
    '&:hover': { background: '#74c7ec' },
  },
  '.cm-code-block-modal-btn--secondary': {
    background: '#313244',
    color: '#cdd6f4',
    '&:hover': { background: '#45475a' },
  },
})

/* ── export ── */

export function pasteCodeWidget(): Extension {
  return [codeBlockField, pasteHandler, theme]
}
