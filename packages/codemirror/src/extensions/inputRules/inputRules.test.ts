import { describe, expect, test } from 'bun:test'
import type { EditorState } from '@codemirror/state'
import { parse, render } from '../../test/editor'
import { inputRuleTransaction, splitCursor } from './apply'
import { resolveConfig, type ResolvedConfig } from './config'
import { packedInputRules, templates, today } from './index'
import { HORIZONTAL_RULE } from './presets/markdown'

const config = resolveConfig(packedInputRules)

function press(state: EditorState, key: string, cfg: ResolvedConfig = config): EditorState {
  const spec = inputRuleTransaction(state, key, cfg)
  // no rule fired, so the browser would have inserted the character itself
  if (!spec) return state.update(state.replaceSelection(key)).state
  return state.update(spec).state
}

function type(spec: string, keys: string, cfg: ResolvedConfig = config): string {
  let state = parse(spec)
  for (const key of keys) state = press(state, key, cfg)
  return render(state)
}

describe('swaps', () => {
  test('translate the character before anything else sees it', () => {
    expect(type('|', '4')).toBe('$|')
    expect(type('|', '$')).toBe('4|')
    expect(type('|', ';')).toBe(':|')
    expect(type('|', ':')).toBe(';|')
  })

  test('do not loop back through the swap map', () => {
    expect(type('|', '4$;:')).toBe('$4:;|')
  })

  test('do not fall through to the rules of the key they land on', () => {
    // '(' swaps to '9', but must not then fire the '9' bracket rule
    expect(type('|', '(')).toBe('9|')
  })
})

describe('punctuation rules', () => {
  test('a comma brings its own space', () => {
    expect(type('a|', ',')).toBe('a, |')
  })

  test('a comma before an existing space stays bare', () => {
    expect(type('a| b', ',')).toBe('a,| b')
  })

  test('a second space after punctuation is swallowed', () => {
    expect(type('a|', ', ')).toBe('a, |')
    expect(type('a|', ',  ')).toBe('a, |')
  })

  test('backslash + r becomes a padded arrow', () => {
    expect(type('foo \\|', 'r')).toBe('foo -> |')
    expect(type('foo\\|', 'r')).toBe('foo -> |')
  })
})

describe('abbrevs', () => {
  test('expand on the trigger and keep it', () => {
    expect(type('|', 'arr ')).toBe('-> |')
    expect(type('x = |', 'darr ')).toBe('x = => |')
  })

  test('respect the word boundary', () => {
    expect(type('|', 'carr ')).toBe('carr |')
  })

  test('l expands to let', () => {
    expect(type('|', 'l ')).toBe('let |')
    expect(type('|', 'al ')).toBe('al |')
  })

  test('fm expands to dated yaml front matter', () => {
    expect(type('|', 'fm ')).toBe(`---\ndate: ${today()}\n|\n---`)
  })

  test('mu expands to an indented markup template', () => {
    expect(type('|', 'mu ')).toBe('markup(`\n\t|\n`)')
    expect(type('  |', 'mu ')).toBe('  markup(`\n  \t|\n  `)')
  })
})

describe('closers and slash', () => {
  test('a second space after a closer is swallowed', () => {
    expect(type('f(a)|', '  ')).toBe('f(a) |')
    expect(type('"a"|', '  ')).toBe('"a" |')
  })

  test('slash on an empty line opens a line comment', () => {
    expect(type('|', '/')).toBe('// |')
    expect(type('  |', '/')).toBe('  // |')
    expect(type('a|', '/')).toBe('a/|')
  })
})

describe('dash rules', () => {
  test('a dash on a blank line becomes a bullet', () => {
    expect(type('|', '-')).toBe('- |')
  })

  test('the bullet keeps the line indentation', () => {
    expect(type('  |', '-')).toBe('  - |')
  })

  test('bullet plus dash jumps to a triple dash, indentation included', () => {
    expect(type('  - |', '-')).toBe('  ---|')
    expect(type('- |', '-')).toBe('---|')
  })

  test('a double dash closes to a triple dash', () => {
    expect(type('--|', '-')).toBe('---|')
  })

  test('a triple dash expands to the horizontal rule', () => {
    expect(type('---|', '-')).toBe(`${HORIZONTAL_RULE}\n|`)
  })

  test('typing a dash mid-line is left alone', () => {
    expect(type('- |foo', '-')).toBe('- -|foo')
  })

  test('the whole ladder from one blank line', () => {
    expect(type('|', '---')).toBe(`${HORIZONTAL_RULE}\n|`)
  })

  test('a fourth dash starts a bullet on the fresh line', () => {
    expect(type('|', '----')).toBe(`${HORIZONTAL_RULE}\n- |`)
  })
})

describe('heading rules', () => {
  test('a line start opens at h2', () => {
    expect(type('|', '3')).toBe('## |')
  })

  test('just after the prefix, deepen it', () => {
    expect(type('## |', '3')).toBe('### |')
  })

  test('at the line start of a heading, deepen it and stay put', () => {
    expect(type('|## foo', '3')).toBe('#|## foo')
  })

  test('stops at h5', () => {
    expect(type('|', '3333')).toBe('##### |')
    expect(type('##### |', '3')).toBe('##### 3|')
  })

  test('the shifted key swaps back to a bare 3', () => {
    expect(type('|', '#')).toBe('3|')
    expect(type('|', '###')).toBe('333|')
  })

  test('a 3 that is not at a line start is just a digit', () => {
    expect(type('a|', '3')).toBe('a3|')
  })
})

describe('brackets', () => {
  test('9 opens an empty pair with the cursor inside', () => {
    expect(type('|', '9')).toBe('(|)')
  })

  test('the shifted paren key swaps back to a bare 9', () => {
    expect(type('|', '(')).toBe('9|')
  })

  test('a selection is wrapped and stays selected', () => {
    expect(type('«foo»', '(')).toBe('(«foo»)')
    expect(type('«foo»', '[')).toBe('[«foo»]')
    expect(type('«foo»', '}')).toBe('{«foo»}')
  })

  test('wraps nest', () => {
    expect(type('«foo»', '([')).toBe('([«foo»])')
  })

  test('a multi-line selection is wrapped as an indented block', () => {
    expect(type('«foo\nbar»', '{')).toBe('{\n«  foo\n  bar»\n}')
  })

  test('block wrap keeps the base indentation and expands to whole lines', () => {
    expect(type('  fo«o\n  ba»r', '{')).toBe('  {\n«    foo\n    bar»\n  }')
  })

  test('block wrap preserves relative indentation inside the selection', () => {
    expect(type('«a\n  b»', '{')).toBe('{\n«  a\n    b»\n}')
  })
})

describe('code', () => {
  test('a backtick opens an empty pair', () => {
    expect(type('|', '`')).toBe('`|`')
    expect(type('a |', '`')).toBe('a `|`')
  })

  test('a backtick before text is left alone', () => {
    expect(type('|foo', '`')).toBe('`|foo')
  })

  test('the closing backtick is stepped over', () => {
    expect(type('|', '`x`')).toBe('`x`|')
  })

  test('three backticks at the line start open a fenced block', () => {
    expect(type('|', '```')).toBe('```\n|\n```')
    expect(type('  |', '```')).toBe('  ```\n  |\n  ```')
  })

  test('three backticks mid-line stay bare', () => {
    expect(type('a |', '```')).toBe('a ```|')
  })

  test('a selection is wrapped in backticks', () => {
    expect(type('«foo»', '`')).toBe('`«foo»`')
  })

  test('a language typed on an empty line expands to a fenced block', () => {
    expect(type('|', 'py')).toBe('```py\n|\n```')
    expect(type('  |', 'py')).toBe('  ```py\n  |\n  ```')
    expect(type('|', 'css')).toBe('```css\n|\n```')
    expect(type('|', 'html')).toBe('```html\n|\n```')
  })

  test('a language mid-line, inside a word or before text is left alone', () => {
    expect(type('a |', 'py')).toBe('a py|')
    expect(type('|', 'spy')).toBe('spy|')
    expect(type('p|x', 'y')).toBe('py|x')
  })

  /* see FENCE_LANGUAGES in presets/code: no language may prefix another,
     so `ts` is left out rather than pre-empt `tsx` */
  test('a language that is not registered is left alone', () => {
    expect(type('|', 'ts')).toBe('ts|')
    expect(type('|', 'sh')).toBe('sh|')
  })

  test('a template can wait for an explicit trigger', () => {
    const cfg = resolveConfig({ rules: templates({ ts: '```ts\n|\n```' }, { on: ' ' }) })
    expect(type('|', 'ts', cfg)).toBe('ts|')
    expect(type('|', 'ts ', cfg)).toBe('```ts\n|\n```')
    expect(type('|foo', 'ts ', cfg)).toBe('ts |foo')
  })
})

describe('multiple cursors', () => {
  test('every cursor runs the pipeline', () => {
    expect(type('a|b|', ',')).toBe('a, |b, |')
  })

  test('a selection and a cursor can take different branches', () => {
    expect(type('«foo»\nbar|', '(')).toBe('(«foo»)\nbar9|')
  })

  test('rules that match at only one cursor still fire there', () => {
    expect(type('---|\nx|', '-')).toBe(`${HORIZONTAL_RULE}\n|\nx-|`)
  })
})

describe('transaction shape', () => {
  test('every application is tagged as typing', () => {
    const spec = inputRuleTransaction(parse('a|'), ',', config)!
    expect(spec.userEvent).toBe('input.type')
  })

  test('an unmatched character is left to the browser', () => {
    expect(inputRuleTransaction(parse('|'), 'z', config)).toBeNull()
  })

  test('multi-character input is left to the browser', () => {
    expect(inputRuleTransaction(parse('|'), 'ab', config)).toBeNull()
  })
})

describe('splitCursor', () => {
  test('finds the marker', () => {
    expect(splitCursor('(|)')).toEqual({ text: '()', cursor: 1 })
  })

  test('defaults to the end', () => {
    expect(splitCursor('## ')).toEqual({ text: '## ', cursor: 3 })
  })

  test('honours an escaped pipe', () => {
    expect(splitCursor('\\| a \\|')).toEqual({ text: '| a |', cursor: 5 })
    expect(splitCursor('\\|a|')).toEqual({ text: '|a', cursor: 2 })
  })
})

describe('line comments', () => {
  test("'/' on a blank line opens a comment, and again deepens it rather than typing `// /`", () => {
    expect(type('|', '/')).toBe('// |')
    expect(type('|', '//')).toBe('/// |')
    expect(type('  |', '//')).toBe('  /// |')
  })

  test("'/' after a comment with text is literal", () => {
    expect(type('// a|', '/')).toBe('// a/|')
  })
})
