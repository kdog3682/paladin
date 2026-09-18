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

/* '#' deepens an existing heading, or opens a new one at h2 */
export const headingRules: InputRule[] = [
  /* at the line start of an existing heading, deepen it and stay put */
  { on: '#', before: /^$/, after: /^#{1,4} /, insert: '#' },
  /* just after the '### ' prefix, deepen it and follow the prefix */
  { on: '#', before: /^(#{1,4}) $/, insert: (m) => m[1] + '# ' },
  /* anywhere else at a line start, open at h2 */
  { on: '#', before: /^$/, insert: '## ' },
]

export const markdownRules: InputRule[] = [...dashRules, ...headingRules]
