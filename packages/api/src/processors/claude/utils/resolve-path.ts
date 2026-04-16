// src/processors/claude/utils/resolve-path.ts

import path from "node:path"
import os from "node:os"

const SCOPED_ALIASES: Record<string, string> = {
  web: "paladin/web",
  api: "paladin/api",
}

const WORKSPACE_FOLDERS = ["packages", "apps"]
const DEFAULT_WORKSPACE = "packages"
const SKIP_SRC_DIRS = ["src", "docs", "scripts", "python", "typst"]
const CONFIG_PREFIXES = ["tsconfig", "package.json"]

export function resolvePath(
  rawPath: string,
  baseDir: string | null,
  baseProjectsDirectory: string,
): string {
  if (rawPath.startsWith("~/")) {
    return path.join(os.homedir(), rawPath.slice(2))
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath
  }

  if (rawPath.startsWith("@")) {
    return resolveScoped(rawPath, baseProjectsDirectory)
  }

  if (!baseDir) {
    throw new Error(`cannot resolve relative path "${rawPath}" without a base directory`)
  }

  if (baseDir.startsWith("@")) {
    const resolvedBase = resolveScoped(baseDir, baseProjectsDirectory)
    return resolveRelative(rawPath, resolvedBase)
  }

  return resolveRelative(rawPath, expandDir(baseDir))
}

function resolveScoped(rawPath: string, baseProjectsDirectory: string): string {
  const base = expandDir(baseProjectsDirectory)

  let withoutAt = rawPath.slice(1)
  const firstSeg = withoutAt.split("/")[0]
  if (SCOPED_ALIASES[firstSeg]) {
    withoutAt = SCOPED_ALIASES[firstSeg] + withoutAt.slice(firstSeg.length)
  }

  const parts = withoutAt.split("/")
  const org = parts[0].toLowerCase()
  const isExplicitWs = WORKSPACE_FOLDERS.includes(parts[1])
  const wsFolder = isExplicitWs ? parts[1] : DEFAULT_WORKSPACE
  const pkg = (isExplicitWs ? parts[2] : parts[1])?.toLowerCase()
  const rest = isExplicitWs ? parts.slice(3) : parts.slice(2)

  const filePath = rest.join("/")

  if (!filePath) {
    return path.join(base, org, wsFolder, pkg)
  }

  const firstName = rest[0]
  const skipSrc =
    SKIP_SRC_DIRS.includes(firstName) ||
    CONFIG_PREFIXES.some((c) => firstName.startsWith(c)) ||
    firstName.includes(".config.")

  const resolved = skipSrc ? filePath : `src/${filePath}`
  return path.join(base, org, wsFolder, pkg, resolved)
}

function resolveRelative(relativePath: string, baseDir: string): string {
  const parts = relativePath.split("/")
  if (parts[0] !== "src") {
    return path.join(baseDir, "src", relativePath)
  }
  return path.join(baseDir, relativePath)
}

function expandDir(dir: string): string {
  if (dir.startsWith("~/")) {
    return path.join(os.homedir(), dir.slice(2))
  }
  return dir
}
