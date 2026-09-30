import { describe, expect, test } from 'bun:test'
import type { EditorView } from '@codemirror/view'
import { mockView, parse, render } from '../../test/editor'
import { NORMAL_COMMANDS, VISUAL_COMMANDS } from './commands'
import { getVim, initialVimState, vimField, type VimMode } from './state'
import { wrapSelection } from './wrap'

/** a view holding a vim state, so the mode and register survive between keys */
const editor = (spec: string, mode: VimMode = 'normal') =>
  mockView(parse(spec, [vimField.init(() => initialVimState(mode))]))

/** run a space separated run of key sequences, picking the map by the current mode */
const keys = (view: EditorView, ...sequences: string[]) => {
  for (const sequence of sequences) {
    const map = getVim(view.state)!.mode === 'visual' ? VISUAL_COMMANDS : NORMAL_COMMANDS
    map[sequence]!(view)
  }
  return render(view.state)
}

const run = (spec: string, ...sequences: string[]) => keys(editor(spec), ...sequences)

describe('normal mode', () => {
  test('D deletes to the end of the line', () => {
    expect(run('foo |bar baz', 'D')).toBe('foo| ')
    expect(run('fo|o\nbar', 'D')).toBe('f|o\nbar')
  })

  test('D at the line end is a no-op, and never reaches the next line', () => {
    expect(run('foo|', 'D')).toBe('foo|')
    expect(run('foo|\nbar', 'D')).toBe('foo|\nbar')
  })

  test('A appends to the line, separating from the last word', () => {
    const view = editor('fo|o')
    expect(keys(view, 'A')).toBe('foo |')
    expect(getVim(view.state)!.mode).toBe('insert')
  })

  test('A does not double a space, and leaves a blank line alone', () => {
    expect(run('fo|o ', 'A')).toBe('foo |')
    expect(run('|', 'A')).toBe('|')
  })

  test('dl takes the rest of the line and drops into insert mode', () => {
    const view = editor('foo |bar baz')
    expect(keys(view, 'd l')).toBe('foo |')
    expect(getVim(view.state)!.mode).toBe('insert')
    expect(getVim(view.state)!.register).toEqual({ text: 'bar baz', linewise: false })
  })

  test('dl at the line end only enters insert mode', () => {
    const view = editor('foo|\nbar')
    expect(keys(view, 'd l')).toBe('foo|\nbar')
    expect(getVim(view.state)!.mode).toBe('insert')
  })

  test('b and f walk the jump list', () => {
    const view = editor('|foo\nbar\nbaz')
    expect(keys(view, 'G')).toBe('foo\nbar\n|baz')
    expect(keys(view, 'b')).toBe('|foo\nbar\nbaz')
    expect(keys(view, 'f')).toBe('foo\nbar\n|baz')
  })

  test('b returns to where the cursor drifted to, not to the old jump target', () => {
    const view = editor('|foo\nbar\nbaz')
    expect(keys(view, 'G', 'l')).toBe('foo\nbar\nb|az')
    expect(keys(view, 'g g')).toBe('|foo\nbar\nbaz')
    expect(keys(view, 'b')).toBe('foo\nbar\nb|az')
  })

  test('motions within a line are not jumps', () => {
    const view = editor('|foo bar')
    keys(view, 'w', '$', '0')
    expect(keys(view, 'b')).toBe('|foo bar')
    expect(getVim(view.state)!.message).toBe('no earlier position')
  })

  test('f with nothing ahead only reports it', () => {
    const view = editor('|foo\nbar')
    keys(view, 'G')
    expect(keys(view, 'f')).toBe('foo\n|bar')
    expect(getVim(view.state)!.message).toBe('no later position')
  })

  test('w and B still move by word', () => {
    expect(run('|foo bar', 'w')).toBe('foo |bar')
    expect(run('foo |bar', 'B')).toBe('|foo bar')
  })

  test('yy then p puts the line below', () => {
    expect(run('|foo\nbar', 'y y', 'p')).toBe('foo\n|foo\nbar')
  })

  test('yy then P puts the line above', () => {
    expect(run('foo\n|bar', 'y y', 'P')).toBe('foo\n|bar\nbar')
  })

  test('a charwise delete can be pasted back after the cursor', () => {
    expect(run('|foo bar', 'd w', 'p')).toBe('bfoo| ar')
  })

  test('p with an empty register only reports it', () => {
    const view = editor('fo|o')
    expect(keys(view, 'p')).toBe('fo|o')
    expect(getVim(view.state)!.message).toBe('register empty')
  })

  test('v enters visual mode with the character under the cursor selected', () => {
    const view = editor('f|oo')
    expect(keys(view, 'v')).toBe('f«o»o')
    expect(getVim(view.state)!.mode).toBe('visual')
  })
})

describe('visual mode', () => {
  test('motions extend the selection', () => {
    expect(run('|foo bar', 'v', 'f')).toBe('«fo»o bar')
    expect(run('|foo bar', 'v', '$')).toBe('«foo bar»')
    expect(run('|foo bar', 'v', 'W')).toBe('«foo b»ar')
    // B keeps the anchored character, the space, and reaches back to the word start
    expect(run('foo| bar', 'v', 'B')).toBe('«foo »bar')
    expect(run('fo|o', 'v', 'l')).toBe('fo«o»')
  })

  test('e reaches the last character of the word, inclusive', () => {
    expect(run('|foo bar', 'v', 'e')).toBe('«foo» bar')
  })

  test('Escape collapses back to normal mode', () => {
    const view = editor('|foo bar')
    keys(view, 'v', 'W')
    expect(keys(view, 'Escape')).toBe('foo |bar')
    expect(getVim(view.state)!.mode).toBe('normal')
  })

  test('d deletes the selection and returns to normal mode', () => {
    const view = editor('|foo bar')
    expect(keys(view, 'v', 'e', 'd')).toBe('| bar')
    expect(getVim(view.state)!.mode).toBe('normal')
  })

  test('x deletes like d', () => {
    expect(run('|foo bar', 'v', 'e', 'x')).toBe('| bar')
  })

  test('c deletes the selection and drops into insert mode', () => {
    const view = editor('|foo bar')
    expect(keys(view, 'v', 'e', 'c')).toBe('| bar')
    expect(getVim(view.state)!.mode).toBe('insert')
  })

  test('y keeps the text and collapses to the start of the selection', () => {
    const view = editor('|foo bar')
    expect(keys(view, 'v', 'e', 'y')).toBe('|foo bar')
    expect(getVim(view.state)!.register).toEqual({ text: 'foo', linewise: false })
  })

  test('the same yank can be pasted over several selections in a row', () => {
    const view = editor('|abc def ghi')
    keys(view, 'v', 'e', 'y', 'W')
    expect(keys(view, 'v', 'e', 'p')).toBe('abc ab|c ghi')
    expect(getVim(view.state)!.register).toEqual({ text: 'abc', linewise: false })
  })

  test('arrows extend the selection instead of collapsing it', () => {
    expect(run('|foo bar', 'v', 'ArrowRight', 'ArrowRight')).toBe('«foo» bar')
    expect(run('foo| bar', 'v', 'ArrowLeft')).toBe('fo«o »bar')
  })

  test('the register survives a delete, so d then p moves text', () => {
    const view = editor('|foo bar')
    keys(view, 'v', 'e', 'd')
    expect(keys(view, '$', 'p')).toBe(' barfo|o')
  })
})

describe('linewise visual (V)', () => {
  test('V selects the whole line', () => {
    const view = editor('fo|o bar\nbaz')
    expect(keys(view, 'V')).toBe('«foo bar»\nbaz')
    expect(getVim(view.state)!.visualLine).toBe(true)
  })

  test('a motion inside the line keeps the whole line selected', () => {
    expect(run('fo|o bar\nbaz', 'V', 'ArrowLeft')).toBe('«foo bar»\nbaz')
  })

  test('moving down takes whole lines with it', () => {
    expect(run('|foo\nbar\nbaz', 'V', 'G')).toBe('«foo\nbar\nbaz»')
  })

  test('y yanks linewise, so p puts it on its own line', () => {
    const view = editor('|foo\nbar')
    keys(view, 'V', 'y')
    expect(getVim(view.state)!.register).toEqual({ text: 'foo', linewise: true })
    expect(keys(view, 'p')).toBe('foo\n|foo\nbar')
  })

  test('d takes the line and its newline', () => {
    expect(run('|foo\nbar\nbaz', 'V', 'd')).toBe('|bar\nbaz')
  })

  test('deleting the last line takes the newline above it', () => {
    expect(run('foo\nba|r', 'V', 'd')).toBe('|foo')
  })

  test('c empties the line but keeps it, ready for insert', () => {
    const view = editor('|foo\nbar')
    expect(keys(view, 'V', 'c')).toBe('|\nbar')
    expect(getVim(view.state)!.mode).toBe('insert')
  })

  test('p replaces the selected lines', () => {
    const view = editor('|foo\nbar')
    keys(view, 'V', 'y', 'G')
    expect(keys(view, 'V', 'p')).toBe('foo\n|foo')
  })

  test('V switches a charwise selection to whole lines, and back out', () => {
    const view = editor('fo|o bar')
    keys(view, 'v', 'V')
    expect(render(view.state)).toBe('«foo bar»')
    expect(keys(view, 'v')).toBe('«foo bar»')
    expect(getVim(view.state)!.visualLine).toBe(false)
    keys(view, 'v')
    expect(getVim(view.state)!.mode).toBe('normal')
  })
})

describe('wrapSelection (visual w)', () => {
  test('w opens the wrap prompt instead of moving', () => {
    const view = editor('|foo bar')
    keys(view, 'v', 'e', 'w')
    expect(getVim(view.state)!.prompt).toEqual({ kind: 'wrap', label: 'wrap ', text: '' })
    expect(render(view.state)).toBe('«foo» bar')
  })

  const wrap = (spec: string, word: string) => {
    const view = editor(spec, 'visual')
    wrapSelection(view, word)
    return render(view.state)
  }

  test('wraps the selected lines in a named block', () => {
    expect(wrap('«foo»', 'flex')).toBe('flex {\n  |foo\n}')
  })

  test('takes whole lines, however little is selected', () => {
    expect(wrap('f«oo\nba»r', 'flex')).toBe('flex {\n  |foo\n  bar\n}')
  })

  test('keeps the base indentation and the relative shape inside it', () => {
    expect(wrap('  «a\n    b»', 'grid')).toBe('  grid {\n    |a\n      b\n  }')
  })

  test('leaves visual mode', () => {
    const view = editor('«foo»', 'visual')
    wrapSelection(view, 'flex')
    expect(getVim(view.state)!.mode).toBe('normal')
  })

  test('a blank word is a no-op', () => {
    expect(wrap('«foo»', '   ')).toBe('«foo»')
  })
})
