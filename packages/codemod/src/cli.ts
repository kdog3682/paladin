import { existsSync } from 'node:fs'
import type { Project } from 'ts-morph'
import { extractSymbol } from './codemods/extractSymbol'
import { remapSymbol } from './codemods/remapSymbol'
import { renameFile } from './codemods/renameFile'
import { renameSymbol } from './codemods/renameSymbol'
import { createProject, loadCodemod, resolveProjectDir } from './run'

export type Action = { action: string } & Record<string, unknown>
export type Spec = { dir: string; actions: Action[]; dry?: boolean }

function requireString(action: Action, ...keys: string[]) {
  for (const key of keys) {
    const value = action[key]
    if (typeof value === 'string') return value
  }
  throw new Error(`${action.action}: missing required field "${keys[0]}"`)
}

function optionalString(action: Action, key: string) {
  const value = action[key]
  return typeof value === 'string' ? value : undefined
}

// Named-field actions map onto the same commands the `test.ts` preamble drives
// positionally (src/codemods/<name>.ts). Anything not listed here falls back to
// loadCodemod + a plain `args` array, so new codemods work without touching this file.
const ACTIONS: Record<string, (project: Project, action: Action) => unknown> = {
  renameSymbol: (project, action) =>
    renameSymbol(
      project,
      requireString(action, 'symbol', 'from'),
      requireString(action, 'to'),
      optionalString(action, 'file')
    ),
  renameFile: (project, action) => renameFile(project, requireString(action, 'file', 'from'), requireString(action, 'to')),
  remapSymbol: (project, action) => remapSymbol(project, requireString(action, 'from'), requireString(action, 'to')),
  extractSymbol: (project, action) =>
    extractSymbol(
      project,
      requireString(action, 'file'),
      requireString(action, 'symbol'),
      requireString(action, 'newFile', 'to'),
      optionalString(action, 'newName')
    ),
}

async function runAction(project: Project, action: Action) {
  const handler = ACTIONS[action.action]
  if (handler) return handler(project, action)

  const fn = await loadCodemod(action.action)
  const args = Array.isArray(action.args) ? action.args : []
  return fn(project, ...args)
}

export async function runSpec(spec: Spec) {
  const project = createProject(spec.dir)

  for (const action of spec.actions) await runAction(project, action)

  const touched = project.getSourceFiles().filter(file => !file.isSaved())
  if (!spec.dry) await project.save()

  return { project, touched }
}

// Sanity check is opt-in per project: drop a sanity.test.ts in the target dir and the
// CLI runs it after applying actions, so a refactor that silently breaks something is
// caught immediately instead of surfacing later.
async function runSanityTest(dir: string) {
  const path = `${dir}/sanity.test.ts`
  if (!existsSync(path)) return null

  console.log(`\nrunning sanity.test.ts`)
  const proc = Bun.spawn(['bun', 'test', path], { stdout: 'inherit', stderr: 'inherit', cwd: dir })
  return (await proc.exited) === 0
}

if (import.meta.main) {
  const raw = process.argv[2]
  if (!raw) {
    console.error(
      [
        "usage: bun src/cli.ts '<json spec>'",
        '',
        '{ "dir": "./src", "actions": [{ "action": "renameSymbol", "symbol": "Foo", "to": "Bar" }] }'
      ].join('\n')
    )
    process.exit(1)
  }

  const spec: Spec = JSON.parse(raw)
  const { touched } = await runSpec(spec)

  console.log(`${touched.length} file(s) ${spec.dry ? 'would change' : 'changed'}`)
  for (const file of touched) console.log(`  ${file.getFilePath()}`)

  if (spec.dry) process.exit(0)

  const sanity = await runSanityTest(resolveProjectDir(spec.dir))
  if (sanity === false) process.exit(1)
}
