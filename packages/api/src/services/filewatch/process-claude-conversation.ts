// @paladin/packages/api/src/services/filewatch/process-claude-conversation.ts

import { existsSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join, basename } from "path"
import { init, parse } from "es-module-lexer"
import { config } from "../../config"
import { log } from "../../logger"
import { bus } from "../../bus"
import { bash } from "../../utils/bash"
import { bootstrap } from "./bootstrap"
import { resolveVersion, flushVersionCache } from "./resolve-npm-version"
import { processConversation } from "./process"
import { Runner } from "./runnable"
import type { FileEntry, Package, Conversation, SessionInfo } from "./types"

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

// ── Project extraction ──────────────────────────────────────

function extractProject(files: FileEntry[]): { projectName: string, rootDir: string } | null {
  for (const file of files) {
    const match = file.path.match(PKG_RE)
    if (!match) continue

    const projectName = match[1]
    const rootDir = file.path.slice(0, file.path.indexOf(`/${projectName}/packages/`) + `/${projectName}`.length + 1)
    return { projectName, rootDir }
  }
  return null
}

// ── File diffing ────────────────────────────────────────────

async function filterChanged(files: FileEntry[]): Promise<FileEntry[]> {
  const changed: FileEntry[] = []

  for (const file of files) {
    if (!existsSync(file.path)) {
      changed.push(file)
      continue
    }

    try {
      const existing = await readFile(file.path, "utf-8")
      if (existing !== file.content) {
        changed.push(file)
      }
    } catch {
      changed.push(file)
    }
  }

  return changed
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

export async function processClaudeConversation(conversation: Conversation): Promise<void> {
  // 1. extract files from conversation
  const files = processConversation(conversation, config.baseProjectsDir)
  if (!files.length) {
    log.warn(`no files extracted from conversation ${conversation.id}`)
    return
  }

  // 2. extract project info
  const project = extractProject(files)
  if (!project) {
    log.warn(`could not determine project from paths in conversation ${conversation.id}`)
    return
  }

  // 3. filter to only changed files
  const changed = await filterChanged(files)
  if (!changed.length) return

  // 4. bootstrap root if needed
  if (!existsSync(join(project.rootDir, "package.json"))) {
    await bootstrap(project.projectName)
  }

  // 5. group into packages
  const packages = groupIntoPackages(changed)

  // 6. write files to disk
  for (const pkg of packages.values()) {
    for (const file of pkg.files) {
      await mkdir(dirname(file.path), { recursive: true })
      await writeFile(file.path, file.content)
    }
  }

  // 7. bootstrap new packages
  for (const pkg of packages.values()) {
    if (pkg.isNew) {
      await bootstrap(`${pkg.projectName}/${pkg.packageName}`)
    }
  }

  // 8. collect imports, diff, and update each package.json
  let depsModified = false

  for (const [, pkg] of packages) {
    const { deps, devDeps } = await collectImports(pkg.files)
    const modified = await diffAndUpdate(join(pkg.dir, "package.json"), deps, devDeps, pkg.projectName)
    if (modified) depsModified = true
  }

  // 9. flush version cache
  await flushVersionCache()

  // 10. install deps if anything changed
  if (depsModified) {
    log.info(`running bun install in ${project.rootDir}`)
    await bash(["bun", "install"], { cwd: project.rootDir })
  }

  // 11. emit session info
  const paths = changed.map((f) => f.path)

  const info: SessionInfo = {
    projectName: project.projectName,
    projectDir: project.rootDir,
    conversation: {
      id: conversation.id,
      url: conversation.url,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    },
    files: paths,
  }

  bus.emit("filewatch:session", info)

  // 12. run matched handlers (tests, demos, etc.)
  const runner = new Runner()
  const matched = await runner.match(paths)

  if (runner.hasPending) {
    bus.emit("filewatch:pending", matched)
    const results = await runner.run()
    bus.emit("filewatch:results", results)
  }
}
