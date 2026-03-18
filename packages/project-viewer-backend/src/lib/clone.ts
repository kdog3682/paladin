// @paladin/project-viewer-backend/src/lib/clone.ts
import { $ } from "bun"
import { exists, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const BASE = join(homedir(), ".cache", "github")

export async function ensureRepo(org: string, name: string): Promise<string> {
  const dir = join(BASE, org, name)
  const already = await exists(dir)
  if (already) return dir

  await mkdir(join(BASE, org), { recursive: true })

  const url = `https://github.com/${org}/${name}.git`
  await $`git clone --depth 1 ${url} ${dir}`.quiet()

  return dir
}

export function repoDir(org: string, name: string): string {
  return join(BASE, org, name)
}
