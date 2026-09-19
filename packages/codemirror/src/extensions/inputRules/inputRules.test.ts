import { describe, expect, test } from 'bun:test'
import { EditorSelection, EditorState } from '@codemirror/state'
import type { SelectionRange } from '@codemirror/state'
import { inputRuleTransaction, splitCursor } from './apply'
import { resolveConfig, type ResolvedConfig } from './config'
import { packedInputRules, templates } from './index'
import { HORIZONTAL_RULE } from './presets/markdown'

const config = resolveConfig(packedInputRules)

/* '|' is a cursor, '«…»' a selection */
function parse(spec: string): EditorState {
  let doc = ''
  const ranges: SelectionRange[] = []
  let anchor = 0
  for (const c of spec) {
    if (c === '|') ranges.push(EditorSelection.cursor(doc.length))
    else if (c === '«') anchor = doc.length
    else if (c === '»') ranges.push(EditorSelection.range(anchor, doc.length))
    else doc += c
  }
  return EditorState.create({
    doc,
    selection: ranges.length ? EditorSelection.create(ranges, 0) : EditorSelection.single(0),
    // without this, EditorState.create collapses the selection to its main range
    extensions: [EditorState.allowMultipleSelections.of(true)],
  })
}

function render(state: EditorState): string {
  const marks: { pos: number, text: string }[] = []
  for (const range of state.selection.ranges) {
    if (range.empty) marks.push({ pos: range.from, text: '|' })
    else {
      marks.push({ pos: range.from, text: '«' })
      marks.push({ pos: range.to, text: '»' })
    }
  }
  marks.sort((a, b) => b.pos - a.pos)
  let doc = state.doc.toString()
  for (const mark of marks) doc = doc.slice(0, mark.pos) + mark.text + doc.slice(mark.pos)
  return doc
}

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
    expect(type('|', '#')).toBe('## |')
  })

  test('just after the prefix, deepen it', () => {
    expect(type('## |', '#')).toBe('### |')
  })

  test('at the line start of a heading, deepen it and stay put', () => {
    expect(type('|## foo', '#')).toBe('#|## foo')
  })

  test('stops at h5', () => {
    expect(type('|', '####')).toBe('##### |')
    expect(type('##### |', '#')).toBe('##### #|')
  })
})

describe('brackets', () => {
  test('9 opens an empty pair with the cursor inside', () => {
    expect(type('|', '9')).toBe('(|)')
  })

  test('the paren key routes through the swap to the same rule', () => {
    expect(type('|', '(')).toBe('(|)')
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
    expect(type('|', 'ts')).toBe('```ts\n|\n```')
    expect(type('  |', 'py')).toBe('  ```py\n  |\n  ```')
  })

  test('a language mid-line, inside a word or before text is left alone', () => {
    expect(type('a |', 'ts')).toBe('a ts|')
    expect(type('|', 'pits')).toBe('pits|')
    expect(type('t|x', 's')).toBe('ts|x')
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
    expect(type('«foo»\nbar|', '(')).toBe('(«foo»)\nbar(|)')
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
