import { describe, expect, test } from 'bun:test'
import { parseTestSummary } from './parseTestSummary'

// real capture: green run, no skip line
const GREEN = `bun test v1.2.4 (fd9a5ea6)

src/path/relativeTo.test.ts:
(pass) relativeTo > strips the root prefix [0.42ms]
(pass) relativeTo > leaves absolute paths alone [0.09ms]

 2 pass
 0 fail
 3 expect() calls
Ran 2 tests across 1 files. [124.00ms]
`

// real capture: failures, ANSI colour, cursor moves, skip line, multiline diff
const RED = `bun test v1.2.4 (fd9a5ea6)
\x1b[2K\x1b[1G
src/fs/readJson.test.ts:
\x1b[32m(pass)\x1b[0m readJson > reads a well-formed file [0.31ms]
\x1b[31m(fail)\x1b[0m readJson > throws on malformed input [1.20ms]

 10 | test("throws on malformed input", () => {
 11 |   const actual = readJson(fixture)
 12 |   expect(actual).toEqual(expected)
                      \x1b[31m^\x1b[0m
error: expect(\x1b[31mreceived\x1b[0m).toEqual(\x1b[32mexpected\x1b[0m)

Expected: { ok: true, counts: { pass: 1 } }
Received: null

      at <anonymous> (/home/j/paladin/packages/utils/src/fs/readJson.test.ts:12:3)
      at run (bun:test:internal)

src/string/slugify.test.ts:
\x1b[31m(fail)\x1b[0m slugify > collapses repeated dashes [0.08ms]

error: expect(received).toBe(expected)

Expected: {
  slug: "a-b",
}
Received: {
  slug: "a--b",
}

\x1b[32m 13 pass\x1b[0m
\x1b[33m 0 skip\x1b[0m
\x1b[31m 15 fail\x1b[0m
 61 expect() calls
Ran 28 tests across 4 files. \x1b[2m[6.09s]\x1b[0m
`

describe('parseTestSummary', () => {
  test('green capture', () => {
    expect(parseTestSummary(GREEN)).toEqual({
      pass: ['relativeTo > strips the root prefix', 'relativeTo > leaves absolute paths alone'],
      failures: [],
      desc: '2 pass',
    })
  })

  test('red capture pass statements and desc', () => {
    const summary = parseTestSummary(RED)!
    expect(summary.pass).toEqual(['readJson > reads a well-formed file'])
    expect(summary.desc).toBe('13/28 pass, 15 fail')
  })

  test('inline expected and received', () => {
    const [first] = parseTestSummary(RED)!.failures

    expect(first.path).toBe('src/fs/readJson.test.ts')
    expect(first.statement).toBe('readJson > throws on malformed input')
    expect(first.expected).toBe('{ ok: true, counts: { pass: 1 } }')
    expect(first.received).toBe('null')
    expect(first.context).toStartWith(' 10 | test("throws on malformed input", () => {')
    expect(first.context).toContain('error: expect(received).toEqual(expected)')
    expect(first.context).toEndWith('      at run (bun:test:internal)')
    expect(first.context).not.toContain('Expected:')
  })

  test('multiline expected and received', () => {
    const [, second] = parseTestSummary(RED)!.failures

    expect(second.path).toBe('src/string/slugify.test.ts')
    expect(second.statement).toBe('slugify > collapses repeated dashes')
    expect(second.expected).toBe('{\n  slug: "a-b",\n}')
    expect(second.received).toBe('{\n  slug: "a--b",\n}')
    expect(second.context).toBe('error: expect(received).toBe(expected)')
  })

  test('strips every escape sequence', () => {
    const summary = parseTestSummary(RED)!
    const blob = [...summary.pass, ...summary.failures.flatMap(Object.values)].join('')
    expect(blob).not.toContain('\x1b')
  })

  test('falls back to the stack path with no file header', () => {
    const summary = parseTestSummary(
      '(fail) readJson > throws [1.00ms]\nerror: boom\n      at <anonymous> (/abs/src/fs/readJson.test.ts:12:3)\n\n 0 pass\n 1 fail\n'
    )!
    expect(summary.failures[0].path).toBe('/abs/src/fs/readJson.test.ts')
    expect(summary.failures[0].statement).toBe('readJson > throws')
    expect(summary.desc).toBe('0/1 pass, 1 fail')
  })

  test('returns null on no match', () => {
    expect(parseTestSummary('')).toBeNull()
    expect(parseTestSummary("error: Cannot find module 'foo'\n")).toBeNull()
    expect(parseTestSummary('we had 13 pass-throughs today\n')).toBeNull()
  })
})
