// @paladin/scaffold-v3/scaffold/index.ts

import { existsSync } from "fs"
import { join, extname } from "path"
import { expandHome, writeFileSafe } from "@paladin/utils/fs"
import { resolveAndDiff, deriveProjectName } from "./resolve-files"
import { hydrate } from "./bootstrap"
import { computeInstalls, type GroupedPackage } from "./install-deps"
import { collectExportEdits, applyExportEdits } from "./package-json"
import { runCommands } from "./run-commands"
import { defaultMatchers } from "./matchers"
import { DEFAULT_CACHE_PATH } from "./dep-cache"
import type { Matcher } from "./matchers/types"
import type { FileContent, ResolvedFile, ProjectData, PackageResult } from "./types"

export interface ScaffoldOptions {
  baseProjectDir?: string
  workspaceFolders?: string[]
  defaultWorkspaceFolder?: string
  depCachePath?: string
  matchers?: Matcher[]
}

export const DEFAULTS = {
  baseProjectDir: "~/projects",
  workspaceFolders: ["packages", "apps"],
  defaultWorkspaceFolder: "packages",
  depCachePath: DEFAULT_CACHE_PATH,
  matchers: defaultMatchers,
}

export async function scaffold(
  fileContents: FileContent[],
  options: ScaffoldOptions = {},
): Promise<ProjectData> {
  const base = expandHome(options.baseProjectDir ?? DEFAULTS.baseProjectDir)
  const wsFolders = options.workspaceFolders ?? DEFAULTS.workspaceFolders
  const defaultWs = options.defaultWorkspaceFolder ?? DEFAULTS.defaultWorkspaceFolder
  const depCachePath = options.depCachePath ?? DEFAULTS.depCachePath
  const matchers = options.matchers ?? DEFAULTS.matchers

  const projectName = deriveProjectName(fileContents)
  if (!projectName) {
    throw new Error("could not derive project name — need at least one @name/... path (not @org/)")
  }

  const projectDir = join(base, projectName)
  const projectIsNew = !existsSync(join(projectDir, "package.json"))

  // resolve, dedupe, diff against disk
  const changed = await resolveAndDiff(fileContents, {
    projectDir,
    projectName,
    workspaceFolders: wsFolders,
    defaultWorkspaceFolder: defaultWs,
  })

  if (!changed.length) {
    return { isNew: projectIsNew, projectDir, projectName, files: [], packages: [], errors: [] }
  }

  // bootstrap project root if new
  const allCreatedFiles: string[] = []
  if (projectIsNew) {
    const created = await hydrate({ dir: projectDir, projectName })
    allCreatedFiles.push(...created)
  }

  // group files by package
  const grouped: Record<string, GroupedPackage> = {}
  for (const f of changed) {
    if (!f.packageName || !f.packageDir) continue
    grouped[f.packageName] ??= {
      packageDir: f.packageDir,
      packageName: f.packageName,
      files: [],
      isNew: !existsSync(join(f.packageDir, "package.json")),
    }
    grouped[f.packageName].files.push(f)
  }

  // run matchers
  const matcherCommands: { cmd: string[]; cwd: string }[] = []
  for (const [, group] of Object.entries(grouped)) {
    const ctx = {
      isNew: group.isNew,
      projectName,
      projectDir,
      packageName: group.packageName,
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

  // write all files to disk
  for (const f of changed) {
    writeFileSafe(f.absolutePath, f.content, extname(f.absolutePath) === ".json" ? { json: true } : undefined)
  }

  // collect and apply subpath export edits
  const exportEdits = collectExportEdits(changed, projectName, projectDir, defaultWs)
  const appliedEdits = await applyExportEdits(exportEdits)

  // install dependencies
  const installResult = await computeInstalls(grouped, projectDir, projectIsNew, depCachePath)

  // run install commands, then matcher commands
  const allCommands = [...installResult.commands, ...matcherCommands]
  const bashResults = await runCommands(allCommands)

  // assemble results
  const packageResults: PackageResult[] = Object.entries(grouped).map(([packageName, group]) => ({
    isNew: group.isNew,
    packageDir: group.packageDir,
    packageName,
    newDependenciesInstalled: installResult.installed.get(packageName) ?? [],
    files: group.files.map(f => ({ isNew: f.isNew, relativePath: f.relativePath })),
  }))

  return {
    isNew: projectIsNew,
    projectDir,
    projectName,
    files: [...new Set([...allCreatedFiles, ...changed.map(f => f.absolutePath)])],
    packages: packageResults,
    exportEdits: appliedEdits,
    errors: bashResults.filter(r => r.exitCode !== 0),
  }
}
