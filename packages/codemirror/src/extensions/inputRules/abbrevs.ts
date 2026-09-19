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

export type TemplateOptions = {
  /* a character that triggers expansion once the word is typed, eg ' '; the trigger is consumed.
     Omitted, the template fires as soon as the word's last character is typed. */
  on?: string | string[]
  /* extra guard, eg notIn('FencedCode') */
  when?: (ctx: RuleContext) => boolean
}

/**
 * templates({ ts: '```ts\n|\n```' }) expands `ts` at the start of an otherwise empty line
 * into a multi-line snippet, only when nothing else is on the line, the moment its last character is typed (or on `options.on`).
 * `|` marks the cursor (`\|` for a literal pipe). The line's indentation is kept on every
 * line of the snippet. Words must not be prefixes of one another: the shorter always wins.
 */
export function templates(map: Record<string, string>, options: TemplateOptions = {}): InputRule[] {
  return Object.entries(map).map(([word, template]) => {
    const auto = options.on === undefined
    const head = auto ? word.slice(0, -1) : word
    return {
      on: auto ? word.slice(-1) : options.on!,
      before: new RegExp(`^([ \\t]*)${escape(head)}$`),
      after: /^\s*$/,
      when: options.when,
      insert: (m) => template.split('\n').map((line) => (line === '' ? line : m[1] + line)).join('\n'),
    }
  })
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
