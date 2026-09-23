import { join } from 'node:path'
import { projectRoot } from './project'
import { runSpec } from './run'
import type { Spec } from './types'

const USAGE = [
  "usage: bun src/cli.ts '<json spec>'",
  '',
  '{ "dir": "./src", "actions": [{ "action": "renameSymbol", "args": ["Foo", "Bar"] }] }',
  '',
  '`files: string[]` (paths relative to dir, or absolute) loads only those files instead of',
  'everything under dir.'
].join('\n')

// Sanity check is opt-in per package: define a `sanity` script and the CLI runs it after
// applying actions, so a refactor that silently breaks something is caught immediately
// instead of surfacing later. No script, no check.
async function runSanity(dir: string) {
  const pkg = Bun.file(join(dir, 'package.json'))
  if (!(await pkg.exists())) return null

  let scripts: Record<string, string> | undefined
  try {
    ;({ scripts } = (await pkg.json()) as { scripts?: Record<string, string> })
  } catch {
    return null
  }

  if (!scripts?.sanity) return null

  console.log('\nbun run sanity')
  const proc = Bun.spawn(['bun', 'run', 'sanity'], { cwd: dir, stdout: 'inherit', stderr: 'inherit' })
  return (await proc.exited) === 0
}

if (import.meta.main) {
  const raw = process.argv[2]
  if (!raw) {
    console.error(USAGE)
    process.exit(1)
  }

  const spec: Spec = JSON.parse(raw)
  const { touched } = await runSpec(spec)

  console.log(`${touched.length} file(s) ${spec.dry ? 'would change' : 'changed'}`)
  for (const file of touched) console.log(`  ${file.getFilePath()}`)

  if (spec.dry) process.exit(0)

  const sanity = await runSanity(projectRoot(spec.dir ?? '.'))
  if (sanity === false) process.exit(1)
}
