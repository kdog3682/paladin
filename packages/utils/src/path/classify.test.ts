import { describe, expect, test } from 'bun:test'
import { type Kind, classify } from '@paladin/utils'

const cases: [string, Kind | null][] = [
  ['src/Button.stories.tsx', 'story'],
  ['src/Button.stories.ts', 'story'],
  ['eval/cases.jsonl', 'corpus'],
  ['data/corpus/rows.json', 'corpus'],
  ['test/fixtures/user.json', 'fixture'],
  ['src/__snapshots__/render.snap', 'fixture'],
  ['src/api.mock.ts', 'fixture'],
  ['src/parse.bench.ts', 'bench'],
  ['benchmarks/parse.ts', 'bench'],
  ['src/a.test.ts', 'test'],
  ['pkg/a.spec.tsx', 'test'],
  ['src/__tests__/helper.ts', 'test'],
  ['examples/basic.ts', 'example'],
  ['src/demo.ts', 'demo'],
  ['src/widget.demo.tsx', 'demo'],
  ['scripts/build.ts', 'script'],
  ['src/seed.script.ts', 'script'],
  ['src/main.tsx', 'boilerplate'],
  ['vite.config.ts', 'boilerplate'],
  ['src/vite-env.d.ts', 'boilerplate'],
  ['package.json', 'manifest'],
  ['tsconfig.build.json', 'manifest'],
  ['Makefile', 'manifest'],
  ['app.config.json', 'manifest'],
  ['src/types/api.ts', 'types'],
  ['src/types.ts', 'types'],
  ['src/global.d.ts', 'types'],
  ['README.md', 'docs'],
  ['docs/architecture.mdx', 'docs'],
  ['CHANGELOG.md', 'docs'],
  ['src/app.css', 'style'],
  ['src/app.scss', 'style'],
  ['config/colors.json', 'data'],
  ['data/rows.csv', 'data'],
  ['notes.txt', 'data'],
  ['src/index.ts', 'source'],
  ['src/Button.tsx', 'source'],
  ['assets/logo.svg', null],
  ['bin/run', null],
]

describe('classify', () => {
  test.each(cases)('%s -> %s', (file, kind) => {
    expect(classify(file)).toBe(kind)
  })
})

describe('precedence', () => {
  test('corpus beats fixture, so a corpus under fixtures/ stays corpus', () => {
    expect(classify('test/fixtures/corpus/rows.json')).toBe('corpus')
  })

  test('fixture beats test, so files under __tests__ are not all tests', () => {
    expect(classify('src/__tests__/__mocks__/fs.ts')).toBe('fixture')
    expect(classify('src/__tests__/user.snap')).toBe('fixture')
  })

  test('boilerplate beats manifest for tool configs', () => {
    expect(classify('eslint.config.js')).toBe('boilerplate')
    expect(classify('jest.config.ts')).toBe('manifest')
  })

  test('manifest beats data for json', () => {
    expect(classify('package.json')).toBe('manifest')
    expect(classify('src/data/package.json')).toBe('manifest')
  })

  test('types beats source for declarations', () => {
    expect(classify('src/env.d.ts')).toBe('types')
  })

  test('example beats demo where their dirs overlap', () => {
    expect(classify('examples/counter.ts')).toBe('example')
    expect(classify('demos/counter.ts')).toBe('demo')
  })
})

describe('not', () => {
  test('literal file names drop test helpers out of test', () => {
    expect(classify('src/__tests__/a.test.ts')).toBe('test')
    expect(classify('src/__tests__/shared.ts')).not.toBe('test')
    expect(classify('tests/helpers.ts')).not.toBe('test')
    expect(classify('tests/setup.ts')).not.toBe('test')
  })

  test('the literal must be a whole filename', () => {
    expect(classify('tests/shared.tsx')).toBe('test')
    expect(classify('tests/notshared.ts')).toBe('test')
  })

  test('source excludes every other code kind', () => {
    expect(classify('src/a.test.ts')).toBe('test')
    expect(classify('src/a.bench.ts')).toBe('bench')
    expect(classify('src/a.stories.ts')).toBe('story')
    expect(classify('src/a.mock.ts')).toBe('fixture')
    expect(classify('src/main.ts')).toBe('boilerplate')
  })
})

describe('matching', () => {
  test('dirs match whole segments only', () => {
    expect(classify('src/testing/a.ts')).toBe('source')
    expect(classify('src/scripting/a.ts')).toBe('source')
    expect(classify('src/documents/a.ts')).toBe('source')
  })

  test('dirs match at any depth', () => {
    expect(classify('a/b/c/scripts/build.ts')).toBe('script')
  })

  test('trailing * stays inside one segment', () => {
    expect(classify('tsconfig.json')).toBe('manifest')
    expect(classify('tsconfig/base.json')).toBe('data')
  })

  test('matching is case-insensitive', () => {
    expect(classify('SRC/App.CSS')).toBe('style')
    expect(classify('Readme.MD')).toBe('docs')
    expect(classify('src/A.TEST.TS')).toBe('test')
  })

  test('dots in rules are literal, not wildcards', () => {
    expect(classify('src/axtestxts')).toBeNull()
  })
})
