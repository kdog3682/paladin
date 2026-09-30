import type { Project } from 'ts-morph'
import { createProject } from './project'
import type { Action, Codemod, Spec } from './types'
import { withoutInsertedSemicolons } from './utils/semicolons'

const toCamelCase = (name: string) => name.replace(/[-_.]+(.)/g, (_, c: string) => c.toUpperCase())

export async function loadCodemod(name: string): Promise<Codemod> {
  const url = new URL(`./codemods/${name}.ts`, import.meta.url)

  let mod: Record<string, unknown>
  try {
    mod = (await import(url.href)) as Record<string, unknown>
  } catch (error) {
    throw new Error(`could not load codemod "${name}" from src/codemods/${name}.ts\n${String(error)}`)
  }

  for (const key of [name, toCamelCase(name), 'default']) {
    const value = mod[key]
    if (typeof value === 'function') return value as Codemod
  }

  const exported = Object.values(mod).filter(value => typeof value === 'function')
  if (exported.length === 1) return exported[0] as Codemod

  throw new Error(`codemod "${name}" must export a function named "${name}"`)
}

export async function runAction(project: Project, action: Action) {
  const codemod = await loadCodemod(action.action)
  return codemod(project, ...(action.args ?? []))
}

export async function runActions(project: Project, actions: Action[]) {
  const results = await withoutInsertedSemicolons(project, async () => {
    const results: unknown[] = []
    for (const action of actions) results.push(await runAction(project, action))
    return results
  })

  return { project, results }
}

/** Bare codemod names are the degenerate case of an action: no arguments. */
export const toActions = (names: string[]): Action[] => names.map(action => ({ action }))

export async function runSpec(spec: Spec, project = createProject(spec.dir ?? '.', spec.files)) {
  await runActions(project, spec.actions)

  const touched = project.getSourceFiles().filter(file => !file.isSaved())
  if (!spec.dry) await project.save()

  return { project, touched }
}

export type CodemodRunOptions = {
  /* project to run against, same resolution rules as Spec.dir */
  dir: string
  codemod: Codemod
  /* positional arguments, passed after the project */
  args?: unknown[]
  /* report what would change without writing. defaults to true */
  dry?: boolean
}

/** Runs a codemod function directly, rather than one looked up by name from src/codemods/. */
export async function runCodemod({ dir, codemod, args = [], dry = true }: CodemodRunOptions) {
  const project = createProject(dir)
  const result = await withoutInsertedSemicolons(project, () => Promise.resolve(codemod(project, ...args)))

  const touched = project.getSourceFiles().filter(file => !file.isSaved())
  if (!dry) await project.save()

  return { project, touched, result }
}
