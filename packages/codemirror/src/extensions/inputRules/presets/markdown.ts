import type { InputRule } from '../types'

export const HORIZONTAL_RULE = '-'.repeat(60)

/* '-' on a blank line becomes a bullet, then '- ' → '---' → a 60-dash rule */
export const dashRules: InputRule[] = [
  {
    on: '-',
    before: /^([ \t]*)$/,
    after: /^\s*$/,
    insert: (m) => m[1] + '- ',
  },
  {
    on: '-',
    before: /^([ \t]*)- $/,
    after: /^\s*$/,
    insert: (m) => m[1] + '---',
  },
  {
    on: '-',
    before: /^([ \t]*)--$/,
    after: /^\s*$/,
    insert: (m) => m[1] + '---',
  },
  {
    on: '-',
    before: /^([ \t]*)---$/,
    after: /^\s*$/,
    insert: (m) => m[1] + HORIZONTAL_RULE + '\n',
  },
]

/* '3' deepens an existing heading, or opens a new one at h2. the unshifted key carries
 * the rule so shift+3 stays a literal '#' */
export const headingRules: InputRule[] = [
  /* at the line start of an existing heading, deepen it and stay put */
  { on: '3', before: /^$/, after: /^#{1,4} /, insert: '#' },
  /* just after the '### ' prefix, deepen it and follow the prefix */
  { on: '3', before: /^(#{1,4}) $/, insert: (m) => m[1] + '# ' },
  /* anywhere else at a line start, open at h2 */
  { on: '3', before: /^$/, insert: '## ' },
]

/* '[' at a line start (after an optional bullet) opens a checked box, ready for its text */
export const checkboxRules: InputRule[] = [
  {
    on: '[',
    before: /^([ \t]*(?:[-*] )?)$/,
    after: /^\s*$/,
    insert: (m) => m[1] + '[✓] ',
  },
]

export const markdownRules: InputRule[] = [...dashRules, ...headingRules, ...checkboxRules]
