import type { InputRule } from '../types'

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* a word followed by a space expands to its template; the space is consumed, `|` marks the cursor,
   and the line's indentation is kept on every continuation line */
export function snippetRules(map: Record<string, string>): InputRule[] {
  return Object.entries(map).map(([word, template]) => ({
    on: ' ',
    before: new RegExp(`(?<![\\p{L}\\p{N}_])${escape(word)}$`, 'u'),
    insert: (_m, ctx) => {
      const indent = ctx.before.match(/^[ \t]*/)![0]
      return template.split('\n').map((line, i) => (i === 0 ? line : indent + line)).join('\n')
    },
  }))
}

export const snippetSource: Record<string, string> = {
  l: 'let |',
  mu: 'markup(`\n\t|\n`)',
}
