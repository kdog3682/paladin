import type { InputRule, RuleContext } from './types'

export type AbbrevOptions = {
  /* characters that trigger expansion, defaults to a space */
  on?: string | string[]
  /* keep the trigger character after the expansion, defaults to true */
  keepTrigger?: boolean
  /* extra guard, eg notIn('CodeText', 'FencedCode') */
  when?: (ctx: RuleContext) => boolean
}

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* abbrevs({ arr: '->' }) expands `arr` to `->` when the next keystroke is a space */
export function abbrevs(map: Record<string, string>, options: AbbrevOptions = {}): InputRule[] {
  const on = options.on ?? ' '
  const keepTrigger = options.keepTrigger ?? true
  return Object.entries(map).map(([word, replacement]) => ({
    on,
    // zero-width lookbehind, so only the word itself is replaced
    before: new RegExp(`(?<![\\p{L}\\p{N}_])${escape(word)}$`, 'u'),
    when: options.when,
    insert: (_match, ctx) => replacement + (keepTrigger ? ctx.char : ''),
  }))
}
