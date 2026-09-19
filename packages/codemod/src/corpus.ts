import { readdir } from 'node:fs/promises'
import yaml from 'js-yaml'
import type { Action, Corpus, CorpusFile } from './types'

const CORPUS = new URL('../corpus/', import.meta.url)
const FILE_HEADER = /^[ \t]*\/\*+[ \t]*([^\s*]+?\.[a-zA-Z]+)[ \t]*\*+\/[ \t]*$/gm
const PREAMBLE = /^\s*\/\*([\s\S]*?)\*\/\s*\n?/

async function readCorpusFile(file: string) {
  const handle = Bun.file(Bun.fileURLToPath(new URL(file, CORPUS)))
  if (!(await handle.exists())) throw new Error(`missing corpus file: corpus/${file}`)
  return await handle.text()
}

export async function listCorpusNames() {
  const entries = await readdir(Bun.fileURLToPath(CORPUS), { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

/** Splits a fixture into files on its header comments, each holding one path. */
export function parseFiles(source: string): CorpusFile[] {
  const headers = [...source.matchAll(FILE_HEADER)]

  return headers.map((header, index) => {
    const start = header.index + header[0].length
    const end = index + 1 < headers.length ? headers[index + 1].index : source.length
    return { path: header[1].replace(/^\.?\//, ''), code: source.slice(start, end).trim() }
  })
}

// Preamble entries are written as YAML but omit the `{ }` around each flow mapping
// (`- command: x, args: [...]`), so brace list-item bodies before parsing.
function bracePreambleEntries(body: string) {
  return body
    .split('\n')
    .map(line => {
      const match = line.match(/^(\s*-\s+)((?:command|action)\s*:.*)$/)
      return match && !match[2].startsWith('{') ? `${match[1]}{ ${match[2]} }` : line
    })
    .join('\n')
}

/** `command:` is the historical spelling of `action:`. */
function toAction(value: unknown): Action | null {
  if (!value || typeof value !== 'object') return null

  const { command, action, args } = value as Record<string, unknown>
  const name = typeof command === 'string' ? command : action
  if (typeof name !== 'string') return null

  return { action: name, args: Array.isArray(args) ? args : [] }
}

export function parsePreamble(source: string): { actions: Action[]; rest: string } {
  const match = source.match(PREAMBLE)
  if (!match) return { actions: [], rest: source }

  let parsed: unknown
  try {
    parsed = yaml.load(bracePreambleEntries(match[1]))
  } catch {
    return { actions: [], rest: source }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return { actions: [], rest: source }

  const actions = parsed.map(toAction)
  if (actions.some(action => action === null)) return { actions: [], rest: source }

  return { actions: actions as Action[], rest: source.slice(match[0].length) }
}

/** `///` lines annotate the expected output for readers; they are not part of it. */
export function stripAnnotations(source: string) {
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

// Each fixture is self-describing: input.ts either carries a preamble of actions to run, or
// the directory name is itself a codemod. Callers pick between the two.
export async function loadCorpus(name: string): Promise<Corpus> {
  const { actions, rest } = parsePreamble(await readCorpusFile(`${name}/input.ts`))

  const input = parseFiles(rest)
  if (input.length === 0) throw new Error(`corpus/${name}/input.ts has no /* path.ts */ headers`)

  const expected = parseFiles(stripAnnotations(await readCorpusFile(`${name}/output.ts`)))

  return { name, actions, input, expected }
}

/** A path to a transform, a command, or a corpus file stands for the corpus it belongs to. */
export function corpusName(arg: string) {
  if (!arg.includes('/')) return arg
  return arg.match(/(?:codemods|corpus)\/([^/.]+)(?:\.ts|\/)/)?.[1] ?? arg
}
