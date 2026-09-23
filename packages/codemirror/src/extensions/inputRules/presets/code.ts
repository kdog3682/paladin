import type { InputRule, WrapSpec } from '../types'

export const codeWraps: WrapSpec[] = [
  { pair: ['`', '`'], block: false },
]

const backticks = (before: string) => before.match(/`/g)?.length ?? 0

export const codeRules: InputRule[] = [
  /* a third backtick at the line start opens a fenced block, indentation included */
  {
    on: '`',
    before: /^([ \t]*)``$/,
    after: /^\s*$/,
    insert: (m) => `${m[1]}\`\`\`\n${m[1]}|\n${m[1]}\`\`\``,
  },
  /* inside an open pair, a backtick steps over the closing one */
  { on: '`', after: /^`/, when: (ctx) => backticks(ctx.before) % 2 === 1, skip: 1, insert: '`' },
  /* a backtick opens an empty pair, unless it follows another backtick (a fence, see above) or precedes text */
  { on: '`', before: /(?<!`)$/, after: /^(?:$|[\s)\]}.,;:!?])/, insert: '`|`' },
]

/* a fence language typed at the start of an empty line becomes a fenced block with the cursor inside.
   No word may prefix another (`ts` would pre-empt `tsx`), and `sh` is left out because it opens "should". */
const FENCE_LANGUAGES = ['py', 'css', 'html']

export const codeTemplateSource: Record<string, string> = Object.fromEntries(
  FENCE_LANGUAGES.map((lang) => [lang, '```' + lang + '\n|\n```']),
)
