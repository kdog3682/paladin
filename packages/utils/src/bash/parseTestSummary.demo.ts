import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { parseTestSummary } from './parseTestSummary'

/**
 * Run: bun src/bash/parseTestSummary.demo.ts
 *      KEEP=1 bun src/bash/parseTestSummary.demo.ts   (keeps the temp dir)
 *      ONLY=nested bun src/bash/parseTestSummary.demo.ts
 *
 * Writes fixture test files to a temp dir, shells out to `bun test` for each,
 * then dumps: raw stderr (escapes made visible), the line-by-line view after
 * ANSI stripping, and the parseTestSummary result. Each fixture is run twice —
 * once with NO_COLOR, once with FORCE_COLOR — and the two parses are compared
 * so ANSI-handling bugs surface on their own.
 */

interface Fixture {
  name: string
  note: string
  want: { pass: number; fail: number }
  files: Record<string, string>
}

const FIXTURES: Fixture[] = [
  {
    name: 'all-pass',
    note: 'baseline, no failures at all',
    want: { pass: 3, fail: 0 },
    files: {
      'basic.test.ts': [
        "import { expect, test } from 'bun:test'",
        '',
        "test('adds numbers', () => {",
        '  expect(1 + 1).toBe(2)',
        '})',
        '',
        "test('joins strings', () => {",
        "  expect('a' + 'b').toBe('ab')",
        '})',
        '',
        "test('array is truthy', () => {",
        '  expect([]).toBeTruthy()',
        '})',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'nested',
    note: 'describe > describe > test naming',
    want: { pass: 2, fail: 1 },
    files: {
      'nested.test.ts': [
        "import { describe, expect, test } from 'bun:test'",
        '',
        "describe('outer', () => {",
        "  describe('inner', () => {",
        "    test('passes', () => {",
        '      expect(1).toBe(1)',
        '    })',
        '',
        "    test('fails', () => {",
        '      expect(1).toBe(2)',
        '    })',
        '  })',
        '',
        "  test('sibling passes', () => {",
        '    expect(true).toBe(true)',
        '  })',
        '})',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'object-diff',
    note: 'multi-line Expected/Received diff block',
    want: { pass: 1, fail: 1 },
    files: {
      'diff.test.ts': [
        "import { expect, test } from 'bun:test'",
        '',
        "test('deep equal fails', () => {",
        "  expect({ a: 1, b: { c: [1, 2, 3] }, d: 'hello' })",
        "    .toEqual({ a: 1, b: { c: [1, 2, 4] }, d: 'hello there' })",
        '})',
        '',
        "test('deep equal passes', () => {",
        '  expect({ a: [1, 2] }).toEqual({ a: [1, 2] })',
        '})',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'thrown',
    note: 'raw throw, no Expected/Received labels at all',
    want: { pass: 1, fail: 2 },
    files: {
      'thrown.test.ts': [
        "import { expect, test } from 'bun:test'",
        '',
        "test('throws raw error', () => {",
        "  throw new Error('boom: something went wrong')",
        '})',
        '',
        "test('rejects async', async () => {",
        "  await Promise.reject(new Error('async boom'))",
        '})',
        '',
        "test('still passes', () => {",
        '  expect(1).toBe(1)',
        '})',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'to-throw',
    note: 'toThrow failure — different body shape',
    want: { pass: 0, fail: 1 },
    files: {
      'tothrow.test.ts': [
        "import { expect, test } from 'bun:test'",
        '',
        "test('expects a throw', () => {",
        "  expect(() => 1).toThrow('nope')",
        '})',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'skip-todo',
    note: 'skip + todo counts alongside pass/fail',
    want: { pass: 1, fail: 1 },
    files: {
      'skip.test.ts': [
        "import { expect, test } from 'bun:test'",
        '',
        "test('passes', () => {",
        '  expect(1).toBe(1)',
        '})',
        '',
        "test.skip('skipped one', () => {",
        '  expect(1).toBe(2)',
        '})',
        '',
        "test.todo('todo item')",
        '',
        "test('fails', () => {",
        "  expect('left').toBe('right')",
        '})',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'multi-file',
    note: 'two files — checks FILE_HEADER attribution of failures',
    want: { pass: 3, fail: 2 },
    files: {
      'alpha.test.ts': [
        "import { expect, test } from 'bun:test'",
        '',
        "test('alpha one', () => {",
        '  expect(1).toBe(1)',
        '})',
        '',
        "test('alpha two fails', () => {",
        '  expect(1).toBe(9)',
        '})',
        '',
      ].join('\n'),
      'nested/beta.test.ts': [
        "import { expect, test } from 'bun:test'",
        '',
        "test('beta one', () => {",
        '  expect(2).toBe(2)',
        '})',
        '',
        "test('beta two', () => {",
        '  expect(3).toBe(3)',
        '})',
        '',
        "test('beta three fails', () => {",
        "  expect('beta').toBe('gamma')",
        '})',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'tricky-names',
    note: 'names containing markers, colons, unicode, durations',
    want: { pass: 3, fail: 1 },
    files: {
      'tricky.test.ts': [
        "import { expect, test } from 'bun:test'",
        '',
        "test('(pass) is not a marker', () => {",
        '  expect(1).toBe(1)',
        '})',
        '',
        "test('\\u2713 unicode tick inside the name', () => {",
        '  expect(1).toBe(1)',
        '})',
        '',
        "test('name: with colon and (parens) [12 ms]', () => {",
        '  expect(1).toBe(1)',
        '})',
        '',
        "test('fails with colon: right here', () => {",
        "  expect('x').toBe('y')",
        '})',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'slow-pass',
    note: 'durations printed next to statements',
    want: { pass: 2, fail: 0 },
    files: {
      'slow.test.ts': [
        "import { expect, test } from 'bun:test'",
        '',
        "test('slow one', async () => {",
        '  await Bun.sleep(60)',
        '  expect(1).toBe(1)',
        '})',
        '',
        "test('slow two', async () => {",
        '  await Bun.sleep(120)',
        '  expect(1).toBe(1)',
        '})',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'no-tests',
    note: 'empty file — parser should degrade, not lie',
    want: { pass: 0, fail: 0 },
    files: {
      'empty.test.ts': ['export {}', ''].join('\n'),
    },
  },
]

const MODES = [
  { label: 'plain', env: { NO_COLOR: '1' } },
  { label: 'color', env: { FORCE_COLOR: '1' } },
] as const

interface Run {
  stdout: string
  stderr: string
  code: number
}

async function main() {
  const only = process.env.ONLY
  const keep = Boolean(process.env.KEEP)
  const root = await mkdtemp(join(tmpdir(), 'pts-demo-'))

  const picked = only ? FIXTURES.filter((f) => f.name.includes(only)) : FIXTURES

  console.log('# parseTestSummary demo')
  console.log('bun     ', Bun.version)
  console.log('platform', process.platform)
  console.log('tmp     ', root)
  console.log('fixtures', picked.map((f) => f.name).join(', '))

  for (const fixture of picked) {
    const dir = join(root, fixture.name)
    await write(dir, fixture.files)

    banner(fixture)

    const parses: Record<string, unknown> = {}

    for (const mode of MODES) {
      const run = await runTests(dir, mode.env)
      const parsed = parseTestSummary(run.stderr)
      parses[mode.label] = parsed

      section(`${mode.label} · exit ${run.code}`)

      if (mode.label === 'plain') {
        block('raw stderr (escapes visible)', visible(run.stderr))
        if (run.stdout.trim()) block('raw stdout', visible(run.stdout))
        block('after ANSI strip (numbered)', numbered(clean(run.stderr)))
      }

      block('parseTestSummary', JSON.stringify(parsed, null, 2))
      verdict(fixture, parsed)
    }

    const same = JSON.stringify(parses.plain) === JSON.stringify(parses.color)
    console.log(same ? '  ansi   : plain === color' : '  ansi   : MISMATCH between plain and color parses')
    if (!same) block('color parse (differs)', JSON.stringify(parses.color, null, 2))
  }

  if (keep) console.log(`\nkept ${root}`)
  else await rm(root, { recursive: true, force: true })
}

async function write(dir: string, files: Record<string, string>) {
  for (const [name, body] of Object.entries(files)) {
    const path = join(dir, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body, 'utf8')
  }
}

async function runTests(cwd: string, env: Record<string, string>): Promise<Run> {
  const proc = Bun.spawn(['bun', 'test'], {
    cwd,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return { stdout, stderr, code }
}

function banner(fixture: Fixture) {
  console.log('\n' + '='.repeat(72))
  console.log(`## ${fixture.name} — ${fixture.note}`)
  console.log(`want: ${fixture.want.pass} pass, ${fixture.want.fail} fail`)
  console.log('='.repeat(72))
}

function section(label: string) {
  console.log(`\n--- ${label} ${'-'.repeat(Math.max(0, 68 - label.length))}`)
}

function block(label: string, body: string) {
  console.log(`\n[${label}]`)
  console.log(body.length ? body : '(empty)')
}

function verdict(fixture: Fixture, parsed: ReturnType<typeof parseTestSummary>) {
  if (!parsed) {
    console.log(`  verdict: null (wanted ${fixture.want.pass} pass, ${fixture.want.fail} fail)`)
    return
  }

  const okPass = parsed.pass.length === fixture.want.pass
  const okFail = parsed.failures.length === fixture.want.fail
  const mark = okPass && okFail ? 'ok  ' : 'DIFF'

  console.log(
    `  verdict: ${mark} pass ${parsed.pass.length}/${fixture.want.pass} · ` +
      `fail ${parsed.failures.length}/${fixture.want.fail} · desc ${JSON.stringify(parsed.desc)}`,
  )

  const blank = parsed.failures.filter((f) => !f.path || !f.statement)
  if (blank.length) console.log(`  note   : ${blank.length} failure(s) missing path or statement`)
}

// mirrors the parser's own cleanup so the numbered dump matches what it sees
const ESCAPES = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -\/]*[@-~]|\x1b[@-Z\\-_]/g

function clean(stderr: string): string[] {
  return stderr
    .replace(ESCAPES, '')
    .split(/\r?\n/)
    .map((line) => line.split('\r').pop()!.trimEnd())
}

function numbered(lines: string[]): string {
  return lines.map((line, i) => `${String(i).padStart(3, ' ')} | ${line}`).join('\n')
}

function visible(text: string): string {
  return text
    .replace(/\x1b/g, '\u241b')
    .replace(/\r/g, '\u240d')
    .replace(/\x07/g, '\u2407')
    .split('\n')
    .map((line, i) => `${String(i).padStart(3, ' ')} | ${line}`)
    .join('\n')
}

await main()
