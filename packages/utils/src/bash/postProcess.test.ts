import { describe, expect, test } from 'bun:test'
import { extractData, foldStderr, relativizeArgs, stripBunVersion, typeOf } from './postProcess'

// real capture from `bun run .../exemplar/src/cli.ts <examples file>`, items trimmed to one.
// exemplar's cli is run through runArgv (packages/utils/src/argv/runArgv.ts), which brackets
// its payload in <BASH>...</BASH>, matching the pair markBashPayload.ts writes and that
// BASH_DATA_RE looks for.
const WITH_ARGV_CAPTURE = `<BASH>{"namespace":"@mathpen/manim","root":"/home/kdog3682/projects/mathpen/packages/manim","files":[{"relpath":"src/grid/grid.examples.ts","artifactPath":null,"displayError":"TypeError: undefined is not an object (evaluating 'bb[indices[0]][0]')","items":[{"output":"{\\"ops\\":[]}","name":"stack","status":"match","ms":22.79}]}],"summary":{"new":0,"match":19,"changed":0,"error":1}}</BASH>`

describe('stripBunVersion', () => {
  test('removes the version banner bun prints on every invocation', () => {
    expect(stripBunVersion('bun test v1.2.4 (fd9a5ea6)\n\nok\n')).toBe('ok')
  })

  test('leaves output without a banner untouched', () => {
    expect(stripBunVersion('  ok  ')).toBe('ok')
  })
})

describe('typeOf', () => {
  test('classifies bun test', () => {
    expect(typeOf(['bun', 'test'])).toBe('test')
  })

  test('classifies bun install subcommands', () => {
    expect(typeOf(['bun', 'add', 'lodash'])).toBe('install')
    expect(typeOf(['bun', 'i'])).toBe('install')
  })

  test('classifies bunx and bare bun run as run', () => {
    expect(typeOf(['bunx', 'cowsay'])).toBe('run')
    expect(typeOf(['bun', 'run', 'src/cli.ts'])).toBe('run')
  })

  test('classifies anything else as shell', () => {
    expect(typeOf(['git', 'status'])).toBe('shell')
  })
})

describe('extractData', () => {
  test('parses a <BASH>...</BASH> payload written by markBashPayload', () => {
    const stdout = 'building...\n<BASH>{"ok":true,"count":3}</BASH>\n'
    expect(extractData(stdout)).toEqual({ text: 'building...', data: { ok: true, count: 3 } })
  })

  test('leaves trailing paths as text: only a <BASH> payload is structured', () => {
    const stdout = 'compiling\nwrote dist/a.js\nwrote dist/b.js\n'
    expect(extractData(stdout)).toEqual({ text: 'compiling\nwrote dist/a.js\nwrote dist/b.js' })
  })

  test('returns plain text when nothing structured is present', () => {
    expect(extractData('just some prose')).toEqual({ text: 'just some prose' })
  })

  test('parses a real runArgv capture from the exemplar cli', () => {
    const { text, data } = extractData(WITH_ARGV_CAPTURE)
    expect(text).toBe('')
    expect(data).toMatchObject({ namespace: '@mathpen/manim', summary: { error: 1 } })
  })
})

describe('relativizeArgs', () => {
  test('rewrites absolute args under cwd to relative, dot-prefixed paths', () => {
    expect(relativizeArgs(['bun', 'run', '/repo/src/cli.ts'], '/repo')).toEqual([
      'bun',
      'run',
      './src/cli.ts',
    ])
  })

  test('leaves paths outside cwd and non-path args untouched', () => {
    expect(relativizeArgs(['bun', '--flag', '/other/file.ts'], '/repo')).toEqual([
      'bun',
      '--flag',
      '/other/file.ts',
    ])
  })

  test('is a no-op with no cwd', () => {
    expect(relativizeArgs(['bun', '/repo/src/cli.ts'])).toEqual(['bun', '/repo/src/cli.ts'])
  })
})

describe('foldStderr', () => {
  test('folds stderr warnings into stdout on success', () => {
    expect(foldStderr('ok', 'warning: dep is deprecated', 0)).toEqual([
      'ok\n\nwarning: dep is deprecated',
      '',
    ])
  })

  test('keeps stdout and stderr separate on failure', () => {
    expect(foldStderr('', 'boom', 1)).toEqual(['', 'boom'])
  })
})
