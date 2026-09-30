import type { InputRule } from '../types'

/** a snippet body, or a function returning one so it can carry today's date */
export type Snippet = string | (() => string)

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* a word followed by a space expands to its template; the space is consumed, `|` marks the cursor,
   and the line's indentation is kept on every continuation line */
export function snippetRules(map: Record<string, Snippet>): InputRule[] {
  return Object.entries(map).map(([word, template]) => ({
    on: ' ',
    before: new RegExp(`(?<![\\p{L}\\p{N}_])${escape(word)}$`, 'u'),
    insert: (_m, ctx) => {
      const indent = ctx.before.match(/^[ \t]*/)![0]
      const body = typeof template === 'function' ? template() : template
      return body.split('\n').map((line, i) => (i === 0 ? line : indent + line)).join('\n')
    },
  }))
}

/** today in the local timezone as YYYY-MM-DD; `toISOString` would report UTC's day */
export function today(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const snippetSource: Record<string, Snippet> = {
  l: 'let |',
  mu: 'markup(`\n\t|\n`)',
  /* yaml front matter, dated the day it is written */
  fm: () => `---\ndate: ${today()}\n|\n---`,
}
