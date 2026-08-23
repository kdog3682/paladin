import { IndentationText, Project, QuoteKind, ts } from 'ts-morph'
import { run } from './run'

const CORPUS = new URL('../corpus/', import.meta.url)
const FILE_HEADER = /^[ \t]*\/\*+[ \t]*([^\s*]+?\.[a-zA-Z]+)[ \t]*\*+\/[ \t]*$/gm

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

function normalize(code: string) {
  return code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
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
  const inputFiles = parseCorpus(await readCorpus(`${name}/input.ts`))
  const expectedFiles = parseCorpus(stripAnnotations(await readCorpus(`${name}/output.ts`)))

  if (inputFiles.length === 0) throw new Error(`corpus/${name}/input.ts has no /* path.ts */ headers`)

  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
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

  await run(names, project)
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

if (import.meta.main) {
  const names = process.argv.slice(2).filter(arg => !arg.startsWith('-'))

  if (names.length === 0) {
    console.error('usage: bun src/test.ts <codemod> [...codemods]')
    process.exit(1)
  }

  const summary = await test(names)
  process.exitCode = summary.pass ? 0 : 1
  console.log(printReport(summary))
}
