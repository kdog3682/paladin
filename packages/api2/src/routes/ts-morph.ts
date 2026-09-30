import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {
  PROJECTS,
  deletePath,
  fsTree,
  isUnderProjects,
  listPackages,
  listProjectSymbols,
  listSymbols,
  packageRootOf,
  renamePath,
  renameSymbolAt,
  symbolDetail,
} from '@paladin/codemod'
import {bash} from '@paladin/utils'
import {createRouter, fail} from './base'

export type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

/* every path comes in from the client, so it is resolved and pinned to ~/projects before use */
const requirePath = (value: string | undefined, label: string) => {
  if (!value?.trim()) fail(400, `${label} is required`)
  const path = resolve(value)
  if (!isUnderProjects(path)) fail(400, `${label} must be inside ${PROJECTS}: ${path}`)
  return path
}

const requireExisting = (value: string | undefined, label: string) => {
  const path = requirePath(value, label)
  if (!existsSync(path)) fail(404, `no such ${label}: ${path}`)
  return path
}

/* a symbol that isn't there is the client's mistake, not a server fault */
const asNotFound = async <T>(run: () => T | Promise<T>) => {
  try {
    return await run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/not declared|no declaration|no source file/.test(message)) fail(404, message)
    throw error
  }
}

const app = createRouter()

/* packages touched within the past withinDays, most recent first */
app.get('/packages', ({withinDays}: {withinDays?: string}) => {
  const days = withinDays === undefined ? 30 : Number(withinDays)
  if (!Number.isFinite(days) || days <= 0) fail(400, `withinDays must be a positive number, got ${withinDays}`)
  return listPackages(days)
})

app.get('/tree', ({root}: {root?: string}) => fsTree(requireExisting(root, 'root')))

app.get('/symbols', ({file}: {file?: string}) => listSymbols(requireExisting(file, 'file')))

app.get('/project-symbols', ({root}: {root?: string}) => listProjectSymbols(requireExisting(root, 'root')))

app.get('/symbol-detail', ({file, name}: {file?: string, name?: string}) => {
  const path = requireExisting(file, 'file')
  if (!name?.trim()) fail(400, 'name is required')
  return asNotFound(() => symbolDetail(path, name))
})

app.post('/rename-path', ({from, to}: {from?: string, to?: string}) =>
  renamePath(requireExisting(from, 'from'), requirePath(to, 'to')),
)

app.post('/delete-path', ({path}: {path?: string}) => deletePath(requireExisting(path, 'path')))

app.post('/rename-symbol', ({file, name, newName}: {file?: string, name?: string, newName?: string}) => {
  const path = requireExisting(file, 'file')
  if (!name?.trim()) fail(400, 'name is required')
  if (!newName?.trim()) fail(400, 'newName is required')
  return asNotFound(() => renameSymbolAt(path, name, newName))
})

/* runs the file with bun, from the root of the package it belongs to */
app.post('/run-file', async ({file}: {file?: string}): Promise<RunResult> => {
  const path = requireExisting(file, 'file')
  const started = Date.now()
  const result = await bash(['bun', 'run', path], {cwd: packageRootOf(path)})
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: Date.now() - started,
  }
})

export default app
