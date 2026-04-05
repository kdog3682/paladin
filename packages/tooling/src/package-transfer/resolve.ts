// @paladin/tooling/package-transfer/resolve.ts
import { join } from "path"
import { readFile } from "fs/promises"
import { dirExists, scopedNameToDir, log, logError } from "./utils"

interface PackageNode {
  name: string
  dir: string
  localDeps: string[]
}

export async function resolveLocalDeps(
  packageName: string,
  sourceRoot: string,
  sourceScope: string,
): Promise<string[]> {
  const graph = new Map<string, PackageNode>()
  await crawl(packageName, sourceRoot, sourceScope, graph)
  return topoSort(graph, packageName)
}

async function crawl(
  packageName: string,
  sourceRoot: string,
  sourceScope: string,
  graph: Map<string, PackageNode>,
) {
  if (graph.has(packageName)) return

  const dirName = scopedNameToDir(packageName, sourceScope)
  const pkgDir = join(sourceRoot, dirName)

  if (!(await dirExists(pkgDir))) {
    logError(`Package directory not found: ${pkgDir}`)
    process.exit(1)
  }

  const pkgJsonPath = join(pkgDir, "package.json")
  const raw = await readFile(pkgJsonPath, "utf-8")
  const pkgJson = JSON.parse(raw)

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  }

  const localDeps: string[] = []

  for (const dep of Object.keys(allDeps)) {
    if (!dep.startsWith(`${sourceScope}/`)) continue

    const depDir = join(sourceRoot, scopedNameToDir(dep, sourceScope))
    if (await dirExists(depDir)) {
      localDeps.push(dep)
    }
  }

  graph.set(packageName, {
    name: packageName,
    dir: pkgDir,
    localDeps,
  })

  log(`Resolved ${packageName} → local deps: [${localDeps.join(", ") || "none"}]`)

  for (const dep of localDeps) {
    await crawl(dep, sourceRoot, sourceScope, graph)
  }
}

function topoSort(graph: Map<string, PackageNode>, root: string): string[] {
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(name: string) {
    if (visited.has(name)) return
    if (visiting.has(name)) {
      logError(`Circular dependency detected involving ${name}`)
      process.exit(1)
    }

    visiting.add(name)
    const node = graph.get(name)

    if (node) {
      for (const dep of node.localDeps) {
        visit(dep)
      }
    }

    visiting.delete(name)
    visited.add(name)
    sorted.push(name)
  }

  visit(root)
  return sorted
}
