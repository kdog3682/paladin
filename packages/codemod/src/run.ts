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
  await withoutInsertedSemicolons(project, async () => {
    for (const action of actions) await runAction(project, action)
  })

  return project
}

/** Bare codemod names are the degenerate case of an action: no arguments. */
export const toActions = (names: string[]): Action[] => names.map(action => ({ action }))

export async function runSpec(spec: Spec, project = createProject(spec.dir ?? '.')) {
  await runActions(project, spec.actions)

  const touched = project.getSourceFiles().filter(file => !file.isSaved())
  if (!spec.dry) await project.save()

  return { project, touched }
}
