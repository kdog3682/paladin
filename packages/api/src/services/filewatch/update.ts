// @paladin/packages/api/src/services/filewatch/update.ts

import { existsSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join, basename } from "path"
import { init, parse } from "es-module-lexer"
import { bootstrap } from "./bootstrap"
import { loadCache, resolveVersion, flushCache } from "./cache"
import { log } from "../../logger"
import type { FileEntry } from "./processors/claude"

// ── Types ───────────────────────────────────────────────────

interface Package {
  projectName: string
  packageName: string
  dir: string
  files: FileEntry[]
  isNew: boolean
}

// ── Grouping ────────────────────────────────────────────────

const PKG_RE = /\/([^/]+)\/packages\/([^/]+)/

function groupIntoPackages(files: FileEntry[]): Map<string, Package> {
  const packages = new Map<string, Package>()

  for (const file of files) {
    const match = file.path.match(PKG_RE)
    if (!match) continue

    const projectName = match[1]
    const packageName = match[2]
    const key = `${projectName}/${packageName}`
    const dir = file.path.slice(0, file.path.indexOf(`/packages/${packageName}/`) + `/packages/${packageName}`.length)

    if (!packages.has(key)) {
      packages.set(key, {
        projectName,
        packageName,
        dir,
        files: [],
        isNew: !existsSync(join(dir, "package.json")),
      })
    }

    packages.get(key)!.files.push(file)
  }

  return packages
}

function extractRootDir(files: FileEntry[]): string | null {
  for (const file of files) {
    const match = file.path.match(PKG_RE)
    if (!match) {
      continue
    }
    const projectName = match[1]
    return file.path.slice(0, file.path.indexOf(`/${projectName}/packages/`) + `/${projectName}`.length + 1)
  }
  return null
}

// ── Import extraction ───────────────────────────────────────

function extractPkgName(specifier: string): string {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/")
  }
  return specifier.split("/")[0]
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec|e2e)\./.test(basename(filePath))
}

async function collectImports(
  files: FileEntry[],
): Promise<{ deps: Set<string>, devDeps: Set<string> }> {
  await init

  const deps = new Set<string>()
  const devDeps = new Set<string>()

  for (const file of files) {
    const target = isTestFile(file.path) ? devDeps : deps

    try {
      const [imports] = parse(file.content)
      for (const imp of imports) {
        if (!imp.n || imp.n.startsWith(".") || imp.n.startsWith("/")) continue
        target.add(extractPkgName(imp.n))
      }
    } catch {
      // skip unparseable files
    }
  }

  for (const name of deps) {
    devDeps.delete(name)
  }

  return { deps, devDeps }
}

// ── Bootstrap key detection ─────────────────────────────────

function detectKey(paths: string[]): string {
  if (paths.some((p) => p.endsWith(".astro"))) return "astro"
  if (paths.some((p) => p.endsWith(".tsx"))) return "web"
  return "default"
}

// ── Package.json diffing ────────────────────────────────────

function sortKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
}

async function diffAndUpdate(
  pkgJsonPath: string,
  deps: Set<string>,
  devDeps: Set<string>,
  projectName: string,
): Promise<boolean> {
  const raw = await readFile(pkgJsonPath, "utf-8")
  const existing = JSON.parse(raw)
  let modified = false

  for (const [field, incoming] of [
    ["dependencies", deps],
    ["devDependencies", devDeps],
  ] as const) {
    if (!incoming.size) continue

    const current: Record<string, string> = existing[field] ?? {}
    let hasNew = false

    for (const name of incoming) {
      if (name in current) continue

      if (name.startsWith(`@${projectName}/`)) {
        current[name] = "workspace:*"
      } else {
        current[name] = await resolveVersion(name)
      }
      hasNew = true
    }

    if (hasNew) {
      existing[field] = sortKeys(current)
      modified = true
    }
  }

  if (modified) {
    await writeFile(pkgJsonPath, JSON.stringify(existing, null, 2) + "\n")
  }

  return modified
}

// ── Main ────────────────────────────────────────────────────

export async function update(files: FileEntry[]): Promise<boolean> {
  const rootDir = extractRootDir(files)
  if (!rootDir) return false

  // 1. group files into packages
  const packages = groupIntoPackages(files)

  // 2. write files
  for (const pkg of packages.values()) {
    for (const file of pkg.files) {
      await mkdir(dirname(file.path), { recursive: true })
      await writeFile(file.path, file.content)
      log.info(`wrote ${file.path}`)
    }
  }

  // 3. bootstrap new packages
  for (const pkg of packages.values()) {
    if (pkg.isNew) {
      const key = detectKey(pkg.files.map((f) => f.path))
      log.info(`bootstrapping new package ${pkg.projectName}/${pkg.packageName} (key=${key})`)
      await bootstrap({ dir: pkg.dir, projectName: pkg.projectName, packageName: pkg.packageName, key })
    }
  }

  // 4. load version cache
  await loadCache(rootDir)

  // 5. collect imports, diff, and update each package
  let depsModified = false

  for (const [, pkg] of packages) {
    const { deps, devDeps } = await collectImports(pkg.files)
    const modified = await diffAndUpdate(join(pkg.dir, "package.json"), deps, devDeps, pkg.projectName)
    if (modified) depsModified = true
  }

  // 6. flush version cache
  await flushCache()

  return depsModified
}
