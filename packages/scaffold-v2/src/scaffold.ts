// @paladin/scaffold-v2/scaffold.ts

import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join, basename, extname } from "path"
import { expandHome, writeFileSafe, readFileSafe } from "@paladin/utils/fs"
import { bash } from "@paladin/utils/bash"
import { bootstrap } from "./bootstrap"
import { loadDepCache, buildCacheFromLockfile, resolveVersion, type DepCache } from "./dep-cache"
import {
  TS_EXTS, SOURCE_EXCLUDED, TS_IMPORT_RE, TS_TEST_RE, NODE_BUILTINS,
} from "./constants"

// --- types ---

interface FileContent {
  content: string
  id?: string
}

interface ResolvedFile {
  path: string
  content: string
  pkg: string | null
  pkgDir: string | null
  status: "created" | "modified"
}

interface PackageResult {
  isNew: boolean
  packageDir: string
  packageName: string
  newDependenciesInstalled: string[]
  files: { status: "created" | "modified", relativePath: string }[]
}

export interface ProjectData {
  isNew: boolean
  projectDir: string
  projectName: string
  files: string[]
  packages: PackageResult[]
}

export interface ScaffoldOptions {
  baseProjectDir?: string
  workspaceFolders?: string[]
  defaultWorkspaceFolder?: string
  bootstrapRefs?: Record<string, string>
}

const DEFAULTS = {
  baseProjectDir: "~/projects",
  workspaceFolders: ["packages", "apps"],
  defaultWorkspaceFolder: "packages",
  bootstrapRefs: {} as Record<string, string>,
}

// --- header / org extraction ---

function extractHeader(content: string): string | null {
  const m = content.match(/^\/\/\s*(.+)\n/)
  if (!m) return null
  const raw = m[1].trim()
  if (!raw.includes("/") && !raw.includes(".")) return null
  return raw
}

function stripHeader(content: string): string {
  return content.replace(/^\/\/\s*.+\n/, "")
}

function deriveOrg(files: FileContent[]): string {
  for (const f of files) {
    const header = extractHeader(f.content)
    if (!header) continue
    const m = header.match(/^@([^/]+)\//)
    if (m) return m[1]
  }
  throw new Error("could not derive org — at least one file must use @org/... path comment")
}

function isDeprecated(content: string): boolean {
  const lines = content.trim().split("\n")
  if (lines[0]?.includes("deprecated")) return true
  if (lines[1]?.includes("deprecated")) return true
  return false
}

// --- lang detection ---

function isSourceFile(filename: string): boolean {
  if (SOURCE_EXCLUDED.some(p => p.test(filename))) return false
  return TS_EXTS.has(extname(filename))
}

// --- import collection ---

function isIgnoredImport(spec: string): boolean {
  if (spec.startsWith("@/") || spec.startsWith(".") || spec.startsWith("node:") || spec.startsWith("bun:")) return true
  const bare = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]
  return NODE_BUILTINS.has(bare)
}

function collectImports(content: string, org: string): { workspace: string[], external: string[] } {
  const ws = new Set<string>()
  const ext = new Set<string>()
  const prefix = `@${org}/`
  for (const [, spec] of content.matchAll(TS_IMPORT_RE)) {
    if (isIgnoredImport(spec)) continue
    const parts = spec.split("/")
    const pkg = spec.startsWith("@") && parts.length >= 2
      ? `${parts[0]}/${parts[1]}`
      : parts[0]
    if (pkg.startsWith(prefix)) ws.add(pkg)
    else ext.add(pkg)
  }
  return { workspace: [...ws], external: [...ext] }
}

// --- path resolution ---

function inferBootstrapKey(files: ResolvedFile[]): string | undefined {
  for (const f of files) {
    if (f.path.endsWith(".astro")) return "astro"
  }
  for (const f of files) {
    if (f.path.endsWith(".tsx")) return "web"
  }
  return undefined
}

function resolveTsPath(
  rel: string,
  root: string,
  wsFolders: string[],
  defaultWs: string,
): { path: string, pkg: string, pkgDir: string } {
  const parts = rel.split("/")
  const isExplicitWs = wsFolders.includes(parts[0])

  const pkgName = isExplicitWs ? parts[1] : parts[0]
  const pkgDir = isExplicitWs
    ? join(root, parts[0], parts[1])
    : join(root, defaultWs, pkgName)
  const filePath = isExplicitWs
    ? parts.slice(2).join("/")
    : parts.slice(1).join("/")

  const resolved = filePath.startsWith("src/") || filePath.includes("/src/")
    ? filePath
    : `src/${filePath}`

  return { path: join(pkgDir, resolved), pkg: pkgName, pkgDir }
}

// --- main scaffold ---

export async function scaffold(
  fileContents: FileContent[],
  options: ScaffoldOptions = {}
): Promise<ProjectData> {
  const base = expandHome(options.baseProjectDir ?? DEFAULTS.baseProjectDir)
  const wsFolders = options.workspaceFolders ?? DEFAULTS.workspaceFolders
  const defaultWs = options.defaultWorkspaceFolder ?? DEFAULTS.defaultWorkspaceFolder
  const bootstrapRefs = { ...DEFAULTS.bootstrapRefs, ...options.bootstrapRefs }

  const org = deriveOrg(fileContents)
  const prefix = `@${org}/`
  const root = join(base, org)
  const projectIsNew = !existsSync(join(root, "package.json"))

  // --- resolve all file paths ---

  const sourceFiles: ResolvedFile[] = []
  const plainFiles: ResolvedFile[] = []

  for (const fc of fileContents) {
    if (isDeprecated(fc.content)) continue

    const header = extractHeader(fc.content)
    if (!header) continue

    const name = basename(header)
    const isJson = extname(name) === ".json"
    const content = isJson ? stripHeader(fc.content) : fc.content

    // absolute or home-relative
    if (header.startsWith("/") || header.startsWith("~/")) {
      plainFiles.push({ path: expandHome(header), content, pkg: null, pkgDir: null, status: "created" })
      continue
    }

    // ./ relative to root
    if (header.startsWith("./")) {
      plainFiles.push({ path: join(root, header.slice(2)), content, pkg: null, pkgDir: null, status: "created" })
      continue
    }

    // bare filename
    if (!header.includes("/")) {
      plainFiles.push({ path: join(root, header), content, pkg: null, pkgDir: null, status: "created" })
      continue
    }

    // validate org
    if (header.startsWith("@")) {
      const m = header.match(/^@([^/]+)\//)
      if (m && m[1] !== org) {
        throw new Error(`multiple orgs: expected @${org} but found @${m[1]} in "${header}"`)
      }
    }

    const rel = header.startsWith(prefix) ? header.slice(prefix.length) : header

    if (isSourceFile(name)) {
      const resolved = resolveTsPath(rel, root, wsFolders, defaultWs)
      sourceFiles.push({
        path: resolved.path,
        content,
        pkg: resolved.pkg,
        pkgDir: resolved.pkgDir,
        status: "created",
      })
    } else {
      plainFiles.push({ path: join(root, rel), content, pkg: null, pkgDir: null, status: "created" })
    }
  }

  // --- determine status (created vs modified) and filter unchanged ---

  const allFiles = [...sourceFiles, ...plainFiles]
  const toWrite: typeof allFiles = []

  for (const f of allFiles) {
    if (existsSync(f.path)) {
      const existing = await readFile(f.path, "utf-8")
      if (existing === f.content) continue
      f.status = "modified"
    }
    toWrite.push(f)
  }

  // --- bootstrap root ---

  if (projectIsNew) {
    await bootstrap({ dir: root, org })
  }

  // --- group source files by package ---

  const grouped: Record<string, { dir: string, files: ResolvedFile[], isNew: boolean }> = {}
  for (const f of toWrite) {
    if (!f.pkg || !f.pkgDir) continue
    grouped[f.pkg] ??= { dir: f.pkgDir, files: [], isNew: !existsSync(join(f.pkgDir, "package.json")) }
    grouped[f.pkg].files.push(f)
  }

  // --- bootstrap packages ---

  let needsInstall = projectIsNew
  for (const [name, group] of Object.entries(grouped)) {
    if (!group.isNew) continue
    const key = bootstrapRefs[name] ?? inferBootstrapKey(group.files)
    await bootstrap({ dir: group.dir, org, pkg: name, key })
    needsInstall = true
  }

  // --- write all files ---

  for (const f of toWrite) {
    const isJson = extname(f.path) === ".json"
    writeFileSafe(f.path, f.content, isJson ? { json: true } : undefined)
  }

  if (needsInstall) {
    await bash(["bun", "install"], { cwd: root })
  }

  // --- load dep cache, build from lockfile if missing ---

  let depCache = await loadDepCache()
  if (!Object.keys(depCache).length && existsSync(join(root, "bun.lockb"))) {
    depCache = await buildCacheFromLockfile(root)
  }

  // --- install deps per package ---

  const packageResults: PackageResult[] = []

  for (const [name, group] of Object.entries(grouped)) {
    const pkgJsonPath = join(group.dir, "package.json")
    const raw = await readFile(pkgJsonPath, "utf-8")
    const pkgJson = JSON.parse(raw)
    const existing = new Set([
      ...Object.keys(pkgJson.dependencies ?? {}),
      ...Object.keys(pkgJson.devDependencies ?? {}),
    ])

    const deps = new Set<string>()
    const devDeps = new Set<string>()

    for (const f of group.files) {
      const imports = collectImports(f.content, org)
      const target = TS_TEST_RE.test(f.path) ? devDeps : deps
      for (const w of imports.workspace) {
        if (!existing.has(w)) target.add(`${w}@workspace:*`)
      }
      for (const e of imports.external) {
        if (!existing.has(e)) target.add(resolveVersion(e, depCache))
      }
    }

    for (const d of deps) devDeps.delete(d)

    const installed: string[] = []

    if (deps.size) {
      await bash(["bun", "add", ...deps], { cwd: group.dir })
      installed.push(...deps)
    }
    if (devDeps.size) {
      await bash(["bun", "add", "-d", ...devDeps], { cwd: group.dir })
      installed.push(...devDeps)
    }

    packageResults.push({
      isNew: group.isNew,
      packageDir: group.dir,
      packageName: name,
      newDependenciesInstalled: installed,
      files: group.files.map(f => ({
        status: f.status,
        relativePath: f.path.slice(group.dir.length + 1),
      })),
    })
  }

  // --- plain files as a virtual "root" package if any ---

  const writtenPlain = toWrite.filter(f => !f.pkg)

  return {
    isNew: projectIsNew,
    projectDir: root,
    projectName: org,
    files: toWrite.map(f => f.path),
    packages: packageResults,
  }
}
