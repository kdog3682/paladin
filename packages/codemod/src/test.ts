import { readdir } from 'node:fs/promises'
import yaml from 'js-yaml'
import { IndentationText, Project, QuoteKind, ts } from 'ts-morph'
import { type CommandInvocation, run, runCommands } from './run'

const CORPUS = new URL('../corpus/', import.meta.url)
const FILE_HEADER = /^[ \t]*\/\*+[ \t]*([^\s*]+?\.[a-zA-Z]+)[ \t]*\*+\/[ \t]*$/gm
const PREAMBLE = /^\s*\/\*([\s\S]*?)\*\/\s*\n?/

async function readCorpus(file: string) {
  const handle = Bun.file(Bun.fileURLToPath(new URL(file, CORPUS)))
  if (!(await handle.exists())) throw new Error(`missing corpus file: corpus/${file}`)
  return await handle.text()
}

function parseCorpus(source: string) {
  const headers = [...source.matchAll(FILE_HEADER)]
  return headers.map((header, index) => {
    const start = header.index + header[0].length
    const end = index + 1 < headers.length ? headers[index + 1].index : source.length
    return { path: header[1].replace(/^\.?\//, ''), code: source.slice(start, end).trim() }
  })
}

function isCommandInvocation(value: unknown): value is CommandInvocation {
  return !!value && typeof value === 'object' && typeof (value as { command?: unknown }).command === 'string'
}

// Preamble commands are written as YAML but omit the `{ }` around each flow
// mapping (`- command: x, args: [...]`), so brace list-item bodies before parsing.
function bracePreambleEntries(body: string) {
  return body
    .split('\n')
    .map(line => {
      const match = line.match(/^(\s*-\s+)(command\s*:.*)$/)
      return match && !match[2].startsWith('{') ? `${match[1]}{ ${match[2]} }` : line
    })
    .join('\n')
}

function parsePreamble(source: string): { commands: CommandInvocation[]; rest: string } {
  const match = source.match(PREAMBLE)
  if (!match) return { commands: [], rest: source }

  let parsed: unknown
  try {
    parsed = yaml.load(bracePreambleEntries(match[1]))
  } catch {
    return { commands: [], rest: source }
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isCommandInvocation)) {
    return { commands: [], rest: source }
  }

  const commands = parsed.map(entry => ({ command: entry.command, args: entry.args ?? [] }))
  return { commands, rest: source.slice(match[0].length) }
}

function stripAnnotations(source: string) {
  const lines = source.split('\n')
  const kept: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('///')) {
      const prevIsAnnotation = i > 0 && lines[i - 1].trim().startsWith('///')
      if (!prevIsAnnotation && kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop()
      continue
    }
    kept.push(line.replace(/[ \t]+\/\/\/.*$/, ''))
  }

  return kept.join('\n')
}

// Blank-line placement is not significant: a codemod's exact number of blank lines around
// an edit (or the fixture's) is incidental, not part of what's being tested.
function normalize(code: string) {
  return code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .filter(line => line !== '')
    .join('\n')
    .trim()
}

function diff(received: string, expected: string) {
  const a = received.length === 0 ? [] : received.split('\n')
  const b = expected.length === 0 ? [] : expected.split('\n')

  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const rows: { tag: string; text: string }[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ tag: ' ', text: a[i++] })
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ tag: '-', text: a[i++] })
    } else {
      rows.push({ tag: '+', text: b[j++] })
    }
  }
  while (i < a.length) rows.push({ tag: '-', text: a[i++] })
  while (j < b.length) rows.push({ tag: '+', text: b[j++] })

  const keep = new Set<number>()
  rows.forEach((row, index) => {
    if (row.tag === ' ') return
    for (let k = index - 2; k <= index + 2; k++) keep.add(k)
  })

  const lines: string[] = []
  let elided = false
  rows.forEach((row, index) => {
    if (!keep.has(index)) {
      if (!elided) lines.push('...')
      elided = true
      return
    }
    elided = false
    lines.push(`${row.tag} ${row.text}`)
  })

  return lines
}

export async function test(names: string[]) {
  const name = names.join('.')
  const { commands, rest: inputSource } = parsePreamble(await readCorpus(`${name}/input.ts`))
  const inputFiles = parseCorpus(inputSource)
  const expectedFiles = parseCorpus(stripAnnotations(await readCorpus(`${name}/output.ts`)))

  if (inputFiles.length === 0) throw new Error(`corpus/${name}/input.ts has no /* path.ts */ headers`)

  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      quoteKind: QuoteKind.Double,
      indentationText: IndentationText.TwoSpaces,
      useTrailingCommas: false
    },
    compilerOptions: {
      strict: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      skipLibCheck: true
    }
  })

  for (const file of inputFiles) project.createSourceFile(`/${file.path}`, file.code, { overwrite: true })

  if (commands.length > 0) await runCommands(commands, project)
  else await run(names, project)
  await project.save()

  const received = new Map(
    project.getSourceFiles().map(file => [file.getFilePath().replace(/^\//, ''), file.getFullText()])
  )

  const paths = [
    ...expectedFiles.map(file => file.path),
    ...[...received.keys()].filter(path => !expectedFiles.some(file => file.path === path)).sort()
  ]

  const files = paths.map(path => {
    const want = expectedFiles.find(file => file.path === path)?.code
    const got = received.get(path)

    if (want === undefined) return { path, status: 'unexpected', diff: diff(normalize(got ?? ''), '') }
    if (got === undefined) {
      if (normalize(want) === '') return { path, status: 'pass', diff: [] as string[] }
      return { path, status: 'missing', diff: diff('', normalize(want)) }
    }
    if (normalize(got) === normalize(want)) return { path, status: 'pass', diff: [] as string[] }

    return { path, status: 'changed', diff: diff(normalize(got), normalize(want)) }
  })

  const failed = files.filter(file => file.status !== 'pass')

  return {
    corpus: name,
    codemods: names,
    pass: failed.length === 0,
    passed: files.length - failed.length,
    failed: failed.length,
    legend: '- received, + expected',
    files: failed.length === 0 ? files.map(({ path, status }) => ({ path, status })) : files
  }
}

export function printReport(summary: Awaited<ReturnType<typeof test>>) {
  const lines: string[] = []
  const status = summary.pass ? 'PASS' : 'FAIL'
  lines.push(`${status} ${summary.corpus} (${summary.passed}/${summary.passed + summary.failed})`)

  for (const file of summary.files) {
    if (file.status === 'pass') {
      lines.push(`  pass      ${file.path}`)
      continue
    }
    lines.push(`  ${file.status.padEnd(9)} ${file.path}`)
    for (const line of file.diff ?? []) lines.push(`    ${line}`)
  }

  return lines.join('\n')
}

async function listCorpusNames() {
  const entries = await readdir(Bun.fileURLToPath(CORPUS), { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

// Each corpus fixture is self-describing: `input.ts` either carries a preamble of commands
// to run, or the directory name is itself a codemod (transform). `test()` already picks
// between the two, so testAll just needs to run every fixture through it.
export async function testAll() {
  const names = await listCorpusNames()
  const summaries = await Promise.all(
    names.map(async name => {
      try {
        return await test([name])
      } catch (error) {
        return {
          corpus: name,
          codemods: [name],
          pass: false,
          passed: 0,
          failed: 1,
          legend: '- received, + expected',
          files: [{ path: '', status: `error: ${String(error)}`, diff: [] as string[] }]
        }
      }
    })
  )

  return {
    pass: summaries.every(summary => summary.pass),
    passed: summaries.filter(summary => summary.pass).length,
    failed: summaries.filter(summary => !summary.pass).length,
    summaries
  }
}

/** A path to a transform, a command, or a corpus file stands for the corpus it belongs to. */
function corpusName(arg: string) {
  if (!arg.includes('/')) return arg
  return arg.match(/(?:codemods|corpus)\/([^/.]+)(?:\.ts|\/)/)?.[1] ?? arg
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const names = args.filter(arg => !arg.startsWith('-')).map(corpusName)

  if (names.length === 0) {
    const { pass, passed, failed, summaries } = await testAll()
    for (const summary of summaries) console.log(printReport(summary))
    console.log(`\n${passed}/${passed + failed} corpora passed`)
    process.exitCode = pass ? 0 : 1
  } else {
    const summary = await test(names)
    process.exitCode = summary.pass ? 0 : 1
    // ends on prose: a report ending in a path line gets lifted out by bash()'s extractArtifactPaths and opened in a browser
    console.log(`${printReport(summary)}\n\n${summary.passed}/${summary.passed + summary.failed} files passed`)
  }
}
