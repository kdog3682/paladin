// @paladin/scaffold-v2/scaffold/install-deps.ts

import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"
import { loadDepCache, resolveVersion, DEFAULT_CACHE_PATH } from "./dep-cache"
import { TS_TEST_RE } from "../constants"
import type { ResolvedFile } from "./types"

export interface GroupedPackage {
  packageDir: string
  packageName: string
  files: ResolvedFile[]
  isNew: boolean
}

export interface InstallResult {
  commands: { cmd: string[]; cwd: string }[]
  installed: Map<string, string[]>
}

/**
 * diff each package's imports against its existing dependencies.
 * returns bun add commands and a map of packageName → newly installed deps.
 */
export async function computeInstalls(
  grouped: Record<string, GroupedPackage>,
  projectDir: string,
  projectIsNew: boolean,
  depCachePath = DEFAULT_CACHE_PATH,
): Promise<InstallResult> {
  const commands: { cmd: string[]; cwd: string }[] = []
  const installed = new Map<string, string[]>()
  const depCache = await loadDepCache(projectDir, depCachePath)

  let needsRootInstall = projectIsNew

  for (const [packageName, group] of Object.entries(grouped)) {
    if (group.isNew) needsRootInstall = true

    const pkgJsonPath = join(group.packageDir, "package.json")
    if (!existsSync(pkgJsonPath)) {
      installed.set(packageName, [])
      continue
    }

    const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"))
    const existing = new Set([
      ...Object.keys(pkgJson.dependencies ?? {}),
      ...Object.keys(pkgJson.devDependencies ?? {}),
    ])

    const deps = new Set<string>()
    const devDeps = new Set<string>()

    for (const f of group.files) {
      const target = TS_TEST_RE.test(f.absolutePath) ? devDeps : deps
      for (const entry of f.imports) {
        if (existing.has(entry.package)) continue
        const resolved = entry.kind === "workspace"
          ? `${entry.package}@workspace:*`
          : resolveVersion(entry.package, depCache)
        target.add(resolved)
      }
    }

    for (const d of deps) devDeps.delete(d)

    if (deps.size) {
      commands.push({ cmd: ["bun", "add", ...deps], cwd: group.packageDir })
    }
    if (devDeps.size) {
      commands.push({ cmd: ["bun", "add", "-d", ...devDeps], cwd: group.packageDir })
    }

    installed.set(packageName, [...deps, ...devDeps])
  }

  if (needsRootInstall) {
    commands.unshift({ cmd: ["bun", "install"], cwd: projectDir })
  }

  return { commands, installed }
}
