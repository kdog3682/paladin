import { describe, expect, test } from 'bun:test'
import { EditorState } from '@codemirror/state'
import { headingBlockAt, headingFoldRange } from './headingFold'

const DOC = ['# a', '## b', 'x', '### c', 'y', '', '## d', 'z', '# e', 'w'].join('\n')
const state = EditorState.create({ doc: DOC })

/** the folded text for the heading on line `n` */
const folded = (n: number) => {
  const range = headingFoldRange(state, state.doc.line(n).from)
  return range && state.sliceDoc(range.from, range.to)
}

describe('headingFoldRange', () => {
  test('## folds its ### children and stops at the next ##, leaving the blank gap', () => {
    expect(folded(2)).toBe('\nx\n### c\ny')
  })

  test('### stops at a higher heading', () => {
    expect(folded(4)).toBe('\ny')
  })

  test('# folds everything up to the next #', () => {
    expect(folded(1)).toBe('\n## b\nx\n### c\ny\n\n## d\nz')
  })

  test('non-headings and empty sections do not fold', () => {
    expect(folded(3)).toBeNull()
    expect(headingFoldRange(EditorState.create({ doc: '## a\n## b' }), 0)).toBeNull()
  })
})

describe('headingBlockAt', () => {
  const block = (doc: string, at: number) => headingBlockAt(EditorState.create({ doc }), at)

  test('copies from the heading (without its #s) through its subsections', () => {
    const doc = '## section\nbody\n### sub\nmore\n## other\nno'
    expect(block(doc, 12)).toEqual({ text: 'section\nbody\n### sub\nmore', lines: 4 })
  })

  test('a cursor in a subsection takes only that subsection', () => {
    const doc = '## section\nbody\n### sub\nmore\n## other'
    expect(block(doc, doc.indexOf('more'))).toEqual({ text: 'sub\nmore', lines: 2 })
  })

  test('text before any heading runs to the first heading', () => {
    expect(block('intro\n\n## a\nx', 0)).toEqual({ text: 'intro', lines: 1 })
  })

  test('an empty doc has no block', () => {
    expect(block('', 0)).toBeNull()
  })
})
