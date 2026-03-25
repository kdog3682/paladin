// @paladin/package-management/lib/dependents.ts

import { readFile } from "fs/promises"
import { join } from "path"
import { glob } from "glob"

export type DependentMap = Map<string, string[]>

export async function findDependents(
  root: string,
  targets: string[]
): Promise<DependentMap> {
  const result: DependentMap = new Map(targets.map(t => [t, []]))
  const pkgFiles = await glob("**/package.json", {
    cwd: root,
    ignore: ["**/node_modules/**"],
    absolute: true,
  })

  for (const pkgPath of pkgFiles) {
    const raw = await readFile(pkgPath, "utf-8")
    const pkg = JSON.parse(raw)
    if (!pkg.name) continue

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }

    for (const target of targets) {
      if (target === pkg.name) continue
      if (allDeps[target]) {
        result.get(target)!.push(pkg.name)
      }
    }
  }

  return result
}

export function hasDependents(depMap: DependentMap): boolean {
  for (const [, deps] of depMap) {
    if (deps.length > 0) return true
  }
  return false
}

export function formatDependentWarnings(depMap: DependentMap): string {
  const lines: string[] = []
  for (const [target, deps] of depMap) {
    if (deps.length > 0) {
      lines.push(`${target} is referenced by: ${deps.join(", ")}`)
    }
  }
  return lines.join("\n")
}
