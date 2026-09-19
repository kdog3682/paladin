import { corpusName, listCorpusNames, loadCorpus } from './corpus'
import { diff, normalize } from './diff'
import { createMemoryProject } from './project'
import { runActions, toActions } from './run'
import type { Corpus, FileResult, Summary } from './types'

const LEGEND = '- received, + expected'

async function applyCorpus(corpus: Corpus, names: string[]) {
  const project = createMemoryProject()

  for (const file of corpus.input) {
    project.createSourceFile(`/${file.path}`, file.code, { overwrite: true })
  }

  await runActions(project, corpus.actions.length > 0 ? corpus.actions : toActions(names))
  await project.save()

  return new Map(
    project.getSourceFiles().map(file => [file.getFilePath().replace(/^\//, ''), file.getFullText()])
  )
}

function compare(corpus: Corpus, received: Map<string, string>): FileResult[] {
  const paths = [
    ...corpus.expected.map(file => file.path),
    ...[...received.keys()].filter(path => !corpus.expected.some(file => file.path === path)).sort()
  ]

  return paths.map(path => {
    const want = corpus.expected.find(file => file.path === path)?.code
    const got = received.get(path)

    if (want === undefined) return { path, status: 'unexpected', diff: diff(normalize(got ?? ''), '') }
    if (got === undefined) {
      if (normalize(want) === '') return { path, status: 'pass', diff: [] }
      return { path, status: 'missing', diff: diff('', normalize(want)) }
    }
    if (normalize(got) === normalize(want)) return { path, status: 'pass', diff: [] }

    return { path, status: 'changed', diff: diff(normalize(got), normalize(want)) }
  })
}

export async function test(names: string[]): Promise<Summary> {
  const name = names.join('.')
  const corpus = await loadCorpus(name)
  const files = compare(corpus, await applyCorpus(corpus, names))
  const failed = files.filter(file => file.status !== 'pass')

  return {
    corpus: name,
    codemods: names,
    pass: failed.length === 0,
    passed: files.length - failed.length,
    failed: failed.length,
    legend: LEGEND,
    // a green run is just a file list; diffs only matter once something fails
    files: failed.length === 0 ? files.map(({ path, status }) => ({ path, status })) : files
  }
}

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
          legend: LEGEND,
          files: [{ path: '', status: `error: ${String(error)}`, diff: [] }]
        } satisfies Summary
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

export function printReport(summary: Summary) {
  const status = summary.pass ? 'PASS' : 'FAIL'
  const lines = [`${status} ${summary.corpus} (${summary.passed}/${summary.passed + summary.failed})`]

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
  const names = process.argv
    .slice(2)
    .filter(arg => !arg.startsWith('-'))
    .map(corpusName)

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
