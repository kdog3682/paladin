import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { Project } from 'ts-morph'

const PROJECTS = join(homedir(), 'projects')

const toCamelCase = (name: string) => name.replace(/[-_.]+(.)/g, (_, c: string) => c.toUpperCase())

const sourceGlobs = (dir: string) => [
  `${dir}/**/*.{ts,tsx}`,
  `!${dir}/**/node_modules/**`,
  `!${dir}/**/dist/**`,
  `!${dir}/**/build/**`,
  `!${dir}/**/*.d.ts`
]

export function resolveProjectDir(spec: string) {
  if (spec.startsWith('~')) return join(homedir(), spec.slice(1))
  if (isAbsolute(spec) || spec.startsWith('.')) return resolve(spec)

  const [repo, ...rest] = spec.split('/')
  const root = join(PROJECTS, repo)
  if (rest.length === 0) return root

  const candidates = [join(root, 'packages', ...rest), join(root, 'apps', ...rest), join(root, ...rest)]
  return candidates.find(existsSync) ?? candidates[0]
}

export function createProject(spec: string) {
  const dir = resolveProjectDir(spec)
  if (!existsSync(dir)) throw new Error(`no such project: ${spec} -> ${dir}`)

  const tsConfigFilePath = join(dir, 'tsconfig.json')
  const project = existsSync(tsConfigFilePath) ? new Project({ tsConfigFilePath }) : new Project()

  if (project.getSourceFiles().length === 0) project.addSourceFilesAtPaths(sourceGlobs(dir))
  if (project.getSourceFiles().length === 0) throw new Error(`no source files found in ${dir}`)

  return project
}

export async function loadCodemod(name: string) {
  const url = new URL(`./transforms/${name}.ts`, import.meta.url)

  let mod: Record<string, unknown>
  try {
    mod = (await import(url.href)) as Record<string, unknown>
  } catch (error) {
    throw new Error(`could not load transform "${name}" from src/transforms/${name}.ts\n${String(error)}`)
  }

  for (const key of [name, toCamelCase(name), 'default']) {
    const value = mod[key]
    if (typeof value === 'function') return value as (project: Project) => unknown
  }

  const exported = Object.values(mod).filter(value => typeof value === 'function')
  if (exported.length === 1) return exported[0] as (project: Project) => unknown

  throw new Error(`transform "${name}" must export a function named "${name}"`)
}

export async function run(names: string[], project: Project | string) {
  const target = typeof project === 'string' ? createProject(project) : project

  for (const name of names) {
    const codemod = await loadCodemod(name)
    await codemod(target)
  }

  return target
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const names = args.filter(arg => !arg.startsWith('-'))
  const dry = args.includes('--dry')
  const spec = args.find(arg => arg.startsWith('--project='))?.slice('--project='.length) ?? '.'

  if (names.length === 0) {
    console.error('usage: bun src/run.ts <codemod> [...codemods] [--project=mathpen/manim] [--dry]')
    process.exit(1)
  }

  const project = await run(names, spec)
  const touched = project.getSourceFiles().filter(file => !file.isSaved())

  if (dry) for (const file of touched) console.log(file.getFilePath())
  else await project.save()

  console.log(`${touched.length} file(s) ${dry ? 'would change' : 'changed'}`)
}
