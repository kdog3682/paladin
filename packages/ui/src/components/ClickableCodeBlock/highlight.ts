import {
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from 'shiki'
import { findClickables, type Clickable } from './clickables'
import { claudeTheme } from './theme'

let hlPromise: Promise<Highlighter> | null = null
const LANGS: BundledLanguage[] = [
  'tsx', 'ts', 'jsx', 'js', 'json', 'bash', 'html', 'css', 'markdown', 'python',
]

function getHighlighter() {
  if (!hlPromise) hlPromise = createHighlighter({ themes: [claudeTheme, 'github-light'], langs: LANGS })
  return hlPromise
}

export interface Run {
  text: string
  color?: string
  italic?: boolean
  bold?: boolean
  underline?: boolean
  click?: Clickable
}

export async function highlight(code: string, lang: BundledLanguage, theme: string) {
  const hl = await getHighlighter()
  let res
  try {
    res = hl.codeToTokens(code, { lang, theme })
  } catch {
    res = hl.codeToTokens(code, { lang: 'text' as BundledLanguage, theme })
  }

  const lines: Run[][] = res.tokens.map((lineTokens) => {
    const clickables = findClickables(lineTokens)
    return lineTokens.map((tk, i) => {
      const fs = tk.fontStyle && tk.fontStyle > 0 ? tk.fontStyle : 0
      return {
        text: tk.content,
        color: tk.color,
        italic: !!(fs & 1),
        bold: !!(fs & 2),
        underline: !!(fs & 4),
        click: clickables.get(i),
      }
    })
  })

  return { lines, bg: res.bg ?? 'transparent', fg: res.fg }
}
