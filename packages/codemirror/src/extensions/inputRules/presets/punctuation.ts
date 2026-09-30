import type { InputRule, RuleContext } from '../types'

/* physical key to logical character; one-way unless both directions are listed */
export const punctuationSwaps: Record<string, string> = {
  '4': '$',
  '$': '4',
  ';': ':',
  ':': ';',
  /* the unshifted keys carry the rules (9 -> the paren pair, 3 -> a heading),
   * so the shifted ones swap back to the plain digit */
  '(': '9',
  '#': '3',
}

/* pads an insertion with the spaces its neighbours are missing */
function pad(insert: string, ctx: RuleContext, consumed: number): string {
  const prev = ctx.before.slice(0, ctx.before.length - consumed).slice(-1)
  const next = ctx.after.slice(0, 1)
  const lead = prev !== '' && prev !== ' ' ? ' ' : ''
  const tail = next !== ' ' ? ' ' : ''
  return lead + insert + tail
}

export const punctuationRules: InputRule[] = [
  /* a comma already followed by a space stays bare */
  { on: ',', after: /^ /, insert: ',' },
  /* otherwise a comma brings its own space */
  { on: ',', insert: ', ' },
  /* a second space after ', ' / '. ' / '! ' / ': ' / ') ' / '] ' / '} ' / "' " / '" ' is swallowed (zero-width lookbehind) */
  { on: ' ', before: /(?<=[,.!:)\]}'"] )$/, insert: '' },
  /* '/' on an empty line opens a line comment */
  { on: '/', before: /^([ \t]*)$/, after: /^\s*$/, insert: (m) => m[1] + '// ' },
  /* '\' + 'r' becomes an arrow, spaced out from its neighbours */
  { on: 'r', before: /\\$/, insert: (_m, ctx) => pad('->', ctx, 1) },
]

export const punctuationAbbrevSource: Record<string, string> = {
  arr: '->',
  darr: '=>',
  larr: '<-',
  neq: '!=',
  leq: '<=',
  geq: '>=',
}
