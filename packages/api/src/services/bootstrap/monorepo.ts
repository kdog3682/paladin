// src/services/bootstrap/monorepo.ts

import { existsSync, readdirSync, statSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join, relative } from "path"
import { glob } from "fast-glob"
import { loadNpmCache, resolveVersion, flushNpmCache } from "./npmCache"
import { loadImportCache, getImports, pruneDeleted, flushImportCache, type ImportEntry } from "../../utils/imports"
import { sortKeys } from "./utils"
import { log } from "../../logger"

// ── Types ───────────────────────────────────────────────────

type Variant = "vite" | "astro" | "next" | "server" | "default" | "root"

interface InstalledDep {
  name: string
  version: string
}

interface PackageData {
  name: string
  dir: string
  new: boolean
  installedDependencies: InstalledDep[]
}

interface MonorepoData {
  name: string
  dir: string
  new: boolean
  packages: PackageData[]
}

// ── Scaffold ────────────────────────────────────────────────

function parseTemplate(raw: string): { path: string, content: string }[] {
  const blocks = raw
    .split(/^={3,}\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean)

  const start = blocks.length % 2 === 1 ? 1 : 0
  const entries: { path: string, content: string }[] = []

  for (let i = start; i < blocks.length - 1; i += 2) {
    entries.push({ path: blocks[i], content: blocks[i + 1] })
  }

  return entries
}

async function detectVariant(dir: string): Promise<Variant> {
  let files: string[] = []
  try {
    files = await glob("**/*.{ts,tsx,astro}", {
      cwd: dir,
      ignore: ["node_modules/**", "dist/**"],
    })
  } catch {
    return "default"
  }

  const has = (check: (f: string) => boolean) => files.some(check)

  if (has((f) => f.endsWith(".astro"))) return "astro"
  if (has((f) => f.endsWith(".tsx") && f.includes("app/"))) return "next"
  if (has((f) => f.endsWith(".tsx"))) return "vite"
  if (has((f) => f === "server.ts" || f.endsWith("/server.ts"))) return "server"
  return "default"
}

async function scaffold(
  rootDir: string,
  projectName: string,
  packageName?: string,
  force = false
): Promise<string[]> {
  const isRoot = !packageName
  const baseDir = isRoot ? rootDir : join(rootDir, "packages", packageName)

  if (!force && existsSync(join(baseDir, "package.json"))) return []

  const variant: Variant = isRoot ? "root" : await detectVariant(baseDir)
  const tpl = await readFile(`${import.meta.dir}/templates/${variant}.tpl`, "utf-8")
  const entries = parseTemplate(tpl)

  const created: string[] = []

  for (const { path: relPath, content: rawContent } of entries) {
    const fullPath = join(baseDir, relPath)
    if (existsSync(fullPath) && !force) continue

    const content = rawContent
      .replaceAll("{{PROJECT_NAME}}", projectName)
      .replaceAll("{{PACKAGE_NAME}}", packageName ?? "")

    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, content)
    created.push(fullPath)
  }

  log.info(`scaffold: ${variant} → ${created.join(", ")}`)
  return created
}

// ── Import Scanning ─────────────────────────────────────────

const SOURCE_GLOBS = ["**/*.{ts,tsx,js,jsx,astro}", "!node_modules/**", "!dist/**"]

async function collectImports(
  pkgDir: string,
  changedFiles?: string[]
): Promise<ImportEntry[]> {
  const files = changedFiles
    ? changedFiles.filter((f) => f.startsWith(pkgDir))
    : await glob(SOURCE_GLOBS, { cwd: pkgDir, absolute: true })

  const results: ImportEntry[] = []

  for (const f of files) {
    results.push(...await getImports(f))
  }

  return results
}

// ── Dep Reconciliation ──────────────────────────────────────

async function reconcileDeps(
  pkgDir: string,
  imports: ImportEntry[],
  projectName: string
): Promise<InstalledDep[]> {
  const pkgJsonPath = join(pkgDir, "package.json")
  const raw = await readFile(pkgJsonPath, "utf-8")

  let pkg: Record<string, any>
  try {
    pkg = JSON.parse(raw)
  } catch {
    throw new Error(`cannot parse json: ${pkgJsonPath}`)
  }

  const grouped = {
    dependencies: new Set<string>(),
    devDependencies: new Set<string>(),
  }

  for (const imp of imports) {
    if (imp.type === "local") continue
    const field = imp.type === "dependency" ? "dependencies" : "devDependencies"
    grouped[field].add(imp.name)
  }

  // deps win over devDeps
  for (const name of grouped.dependencies) {
    grouped.devDependencies.delete(name)
  }

  const installed: InstalledDep[] = []

  for (const [field, names] of Object.entries(grouped) as [string, Set<string>][]) {
    if (!names.size) continue

    const current: Record<string, string> = pkg[field] ?? {}
    let dirty = false

    for (const name of names) {
      if (name in current) continue

      const version = name.startsWith(`@${projectName}/`)
        ? "workspace:*"
        : await resolveVersion(name)

      current[name] = version
      installed.push({ name, version })
      dirty = true
    }

    if (dirty) pkg[field] = sortKeys(current)
  }

  if (installed.length) {
    await writeFile(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n")
  }

  return installed
}

// ── Install ─────────────────────────────────────────────────

async function runInstall(rootDir: string): Promise<void> {
  log.info("running bun install...")
  const proc = Bun.spawn(["bun", "install"], {
    cwd: rootDir,
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
}

// ── Helpers ─────────────────────────────────────────────────

function discoverPackageDirs(packagesDir: string): string[] {
  if (!existsSync(packagesDir)) return []

  return readdirSync(packagesDir)
    .map((name) => join(packagesDir, name))
    .filter((p) => statSync(p).isDirectory())
}

function filterByChangedFiles(
  packageDirs: string[],
  changedFiles?: string[]
): string[] {
  if (!changedFiles) return packageDirs

  return packageDirs.filter((dir) =>
    changedFiles.some((f) => f.startsWith(dir))
  )
}

// ── Main ────────────────────────────────────────────────────

export async function bootstrapMonorepo(
  dir: string,
  changedFiles?: string[]
): Promise<MonorepoData> {
  const projectName = dir.split("/").pop()!
  const packagesDir = join(dir, "packages")

  const rootScaffold = await scaffold(dir, projectName)
  const rootIsNew = rootScaffold.length > 0

  await loadNpmCache(dir)
  await loadImportCache(projectName)
  pruneDeleted()

  const allPackageDirs = discoverPackageDirs(packagesDir)
  const targetDirs = filterByChangedFiles(allPackageDirs, changedFiles)

  let needsInstall = false
  const packages: PackageData[] = []

  for (const pkgDir of targetDirs) {
    const packageName = pkgDir.split("/").pop()!

    const scaffolded = await scaffold(dir, projectName, packageName)
    const isNew = scaffolded.length > 0

    const imports = await collectImports(pkgDir, changedFiles)
    const installed = await reconcileDeps(pkgDir, imports, projectName)

    if (isNew || installed.length) needsInstall = true

    packages.push({
      name: packageName,
      dir: relative(dir, pkgDir),
      new: isNew,
      installedDependencies: installed,
    })
  }

  await flushNpmCache()
  await flushImportCache()

  if (needsInstall) await runInstall(dir)

  return { name: projectName, dir, new: rootIsNew, packages }
}