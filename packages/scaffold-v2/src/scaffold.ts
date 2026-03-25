// @paladin/scaffold-v2/scaffold.ts

import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join, extname } from "path"
import { expandHome, writeFileSafe } from "@paladin/utils/fs"
import { bash, type BashResult } from "@paladin/utils/bash"
import { resolvePath } from "./resolve-path"
import { getImports } from "./get-imports"
import { loadDepCache, resolveVersion, DEFAULT_CACHE_PATH } from "./dep-cache"
import { bootstrap } from "./bootstrap"
import { defaultMatchers } from "./matchers"
import { defaultTransforms, applyTransforms } from "./transforms"
import { TS_TEST_RE } from "./constants"
import type {
  FileContent, ResolvedFile, ContentTransform,
  PackageContext, PackageResult, ProjectData, Matcher,
} from "./types"

export interface ScaffoldOptions {
  baseProjectDir?: string
  workspaceFolders?: string[]
  defaultWorkspaceFolder?: string
  depCachePath?: string
  transforms?: ContentTransform[]
  matchers?: Matcher[]
}

export const DEFAULTS = {
  baseProjectDir: "~/projects",
  workspaceFolders: ["packages", "apps"],
  defaultWorkspaceFolder: "packages",
  depCachePath: DEFAULT_CACHE_PATH,
  transforms: defaultTransforms,
  matchers: defaultMatchers,
}

// --- header helpers ---

/**
 * extract the path comment from the first or second line.
 * supports both `// path` and files starting with a shebang
 * where the path comment is on line 2.
 */
function extractHeader(content: string): string | null {
  const lines = content.split("\n", 3)

  for (const line of lines) {
    if (line.startsWith("#!")) continue
    const m = line.match(/^\/\/\s*(.+)/)
    if (!m) return null
    const raw = m[1].trim()
    if (!raw.includes("/") && !raw.includes(".")) return null
    return raw
  }

  return null
}

function stripHeader(content: string): string {
  return content.replace(/^\/\/\s*.+\n/, "")
}

function deriveProjectName(files: FileContent[]): string | null {
  for (const f of files) {
    const header = extractHeader(f.content)
    if (!header) continue
    const m = header.match(/^@([^/]+)\//)
    if (m && m[1] !== "org") return m[1]
  }
  return null
}

function isDeprecated(content: string): boolean {
  const lines = content.trim().split("\n")
  return (lines[0]?.includes("deprecated") || lines[1]?.includes("deprecated")) ?? false
}

// --- main ---

/** resolve, write, and install artifact file contents into a typescript monorepo. */
export async function scaffold(
  fileContents: FileContent[],
  options: ScaffoldOptions = {}
): Promise<ProjectData> {
  const base = expandHome(options.baseProjectDir ?? DEFAULTS.baseProjectDir)
  const wsFolders = options.workspaceFolders ?? DEFAULTS.workspaceFolders
  const defaultWs = options.defaultWorkspaceFolder ?? DEFAULTS.defaultWorkspaceFolder
  const depCachePath = options.depCachePath ?? DEFAULTS.depCachePath
  const transforms = options.transforms ?? DEFAULTS.transforms
  const matchers = options.matchers ?? DEFAULTS.matchers

  const projectName = deriveProjectName(fileContents)
  if (!projectName) {
    throw new Error("could not derive project name — need at least one @name/... path (not @org/)")
  }

  const projectDir = join(base, projectName)
  const projectIsNew = !existsSync(join(projectDir, "package.json"))

  // --- phase 1: resolve paths, dedupe, diff against disk, compute imports ---

  interface Candidate {
    content: string
    updatedAt: string
    relativePath: string
    packageName: string | null
    packageDir: string | null
  }

  const latest = new Map<string, Candidate>()

  for (const fc of fileContents) {
    if (isDeprecated(fc.content)) continue

    const header = extractHeader(fc.content)
    if (!header) continue

    if (header.startsWith("@")) {
      const m = header.match(/^@([^/]+)\//)
      if (m && m[1] !== projectName) {
        throw new Error(`expected @${projectName} but found @${m[1]} in "${header}"`)
      }
    }

    const isJson = extname(header).endsWith(".json")
    const content = isJson ? stripHeader(fc.content) : fc.content
    const resolved = resolvePath(header, projectDir, projectName, wsFolders, defaultWs)
    const updatedAt = fc.updatedAt ?? ""

    const existing = latest.get(resolved.absolutePath)
    if (!existing || updatedAt > existing.updatedAt) {
      latest.set(resolved.absolutePath, {
        content,
        updatedAt,
        relativePath: resolved.relativePath,
        packageName: resolved.packageName,
        packageDir: resolved.packageDir,
      })
    }
  }

  const changed: ResolvedFile[] = []

  for (const [absolutePath, candidate] of latest) {
    if (existsSync(absolutePath)) {
      const disk = await readFile(absolutePath, "utf-8")
      if (disk === candidate.content) continue
    }

    changed.push({
      absolutePath,
      relativePath: candidate.relativePath,
      content: candidate.content,
      packageName: candidate.packageName,
      packageDir: candidate.packageDir,
      isNew: !existsSync(absolutePath),
      importTable: getImports(candidate.content, projectName),
    })
  }

  if (!changed.length) {
    return { isNew: projectIsNew, projectDir, projectName, files: [], packages: [], errors: [] }
  }

  // --- phase 2: apply content transforms ---

  applyTransforms(changed, transforms)

  // --- phase 3: bootstrap project root ---

  const allCreatedFiles: string[] = []

  if (projectIsNew) {
    const created = await bootstrap({ dir: projectDir, projectName })
    allCreatedFiles.push(...created)
  }

  // --- phase 4: group by package, run matchers ---

  const grouped: Record<string, { packageDir: string, files: ResolvedFile[], isNew: boolean }> = {}
  const plainFiles: ResolvedFile[] = []

  for (const f of changed) {
    if (!f.packageName || !f.packageDir) {
      plainFiles.push(f)
      continue
    }
    grouped[f.packageName] ??= {
      packageDir: f.packageDir,
      files: [],
      isNew: !existsSync(join(f.packageDir, "package.json")),
    }
    grouped[f.packageName].files.push(f)
  }

  const installCommands: { cmd: string[], cwd: string }[] = []
  const matcherCommands: { cmd: string[], cwd: string }[] = []

  for (const [packageName, group] of Object.entries(grouped)) {
    const ctx: PackageContext = {
      isNew: group.isNew,
      projectName,
      projectDir,
      packageName,
      packageDir: group.packageDir,
      files: group.files,
    }

    for (const matcher of matchers) {
      const result = await matcher(ctx)
      if (result.matched) {
        if (result.filesCreated?.length) allCreatedFiles.push(...result.filesCreated)
        if (result.commands?.length) matcherCommands.push(...result.commands)
        if (result.terminal) break
      }
    }
  }

  // --- phase 5: write all files to disk ---

  for (const f of changed) {
    writeFileSafe(f.absolutePath, f.content, extname(f.absolutePath) === ".json" ? { json: true } : undefined)
  }

  // --- phase 6: install deps ---

  let needsInstall = projectIsNew
  const depCache = await loadDepCache(projectDir, depCachePath)
  const packageResults: PackageResult[] = []

  for (const [packageName, group] of Object.entries(grouped)) {
    if (group.isNew) needsInstall = true

    const pkgJsonPath = join(group.packageDir, "package.json")
    if (!existsSync(pkgJsonPath)) continue

    const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"))
    const existing = new Set([
      ...Object.keys(pkgJson.dependencies ?? {}),
      ...Object.keys(pkgJson.devDependencies ?? {}),
    ])

    const deps = new Set<string>()
    const devDeps = new Set<string>()

    for (const f of group.files) {
      const target = TS_TEST_RE.test(f.absolutePath) ? devDeps : deps
      for (const w of f.importTable.workspace) {
        if (!existing.has(w)) target.add(`${w}@workspace:*`)
      }
      for (const e of f.importTable.external) {
        if (!existing.has(e)) target.add(resolveVersion(e, depCache))
      }
    }
    for (const d of deps) devDeps.delete(d)

    if (deps.size) {
      installCommands.push({ cmd: ["bun", "add", ...deps], cwd: group.packageDir })
    }
    if (devDeps.size) {
      installCommands.push({ cmd: ["bun", "add", "-d", ...devDeps], cwd: group.packageDir })
    }

    const installed = [...deps, ...devDeps]

    packageResults.push({
      isNew: group.isNew,
      packageDir: group.packageDir,
      packageName,
      newDependenciesInstalled: installed,
      files: group.files.map(f => ({ isNew: f.isNew, relativePath: f.relativePath })),
    })
  }

  if (needsInstall) {
    installCommands.unshift({ cmd: ["bun", "install"], cwd: projectDir })
  }

  // --- phase 7: run install commands first, then matcher commands ---

  const bashResults: BashResult[] = []

  for (const { cmd, cwd } of installCommands) {
    bashResults.push(await bash(cmd, { cwd }))
  }
  for (const { cmd, cwd } of matcherCommands) {
    bashResults.push(await bash(cmd, { cwd }))
  }

  return {
    isNew: projectIsNew,
    projectDir,
    projectName,
    files: [...new Set([...allCreatedFiles, ...changed.map(f => f.absolutePath)])],
    packages: packageResults,
    errors: bashResults.filter(r => r.exitCode !== 0),
  }
}
