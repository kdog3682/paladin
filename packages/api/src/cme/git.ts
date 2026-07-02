import { existsSync } from 'fs'
import { join } from 'path'
import { $ } from 'bun'
import { projectDir } from './paths'
import { flushDirty } from './docStore'

export async function commitProject(project: string, message = '.') {
  const dir = projectDir(project)
  await $`mkdir -p ${dir}`.quiet()

  const flushed = await flushDirty() // ensure disk matches memory before committing

  if (!existsSync(join(dir, '.git'))) {
    await $`git init`.cwd(dir).quiet()
    await $`git branch -M paladin-project-${project}`.cwd(dir).quiet().nothrow()
  }

  await $`git add -A`.cwd(dir).quiet()
  const result = await $`git commit -m ${message}`.cwd(dir).quiet().nothrow()

  return { ok: result.exitCode === 0, flushed }
}
