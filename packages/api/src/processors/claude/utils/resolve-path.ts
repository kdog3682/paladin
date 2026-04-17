import path from "node:path"
import os from "node:os"

const SCOPED_ALIASES: Record<string, string> = {
  web: "paladin/web",
  api: "paladin/api",
}

const WORKSPACE_FOLDERS = ["packages", "apps"]
const DEFAULT_WORKSPACE = "packages"
const DEFAULT_PKG = "api"

const SKIP_SRC_DIRS = ["src", "docs", "scripts", "python", "typst"]
const CONFIG_PREFIXES = ["tsconfig", "package.json"]

// Segments that map to the web package. Anything else defaults to api.
const WEB_REFS = new Set([
  "components",
  "stores",
  "pages",
  "views",
  "layouts",
  "hooks",
  "context",
  "providers",
  "ui",
  "assets",
  "styles",
  "icons",
  "theme",
])

// -- helpers ----------------------------------------------------------------

function expandDir(dir: string): string {
  return dir.startsWith("~/")
    ? path.join(os.homedir(), dir.slice(2))
    : dir
}

function inferPkg(segments: string[]): "web" | "api" | null {
  for (const s of segments) {
    if (WEB_REFS.has(s)) return "web"
  }
  return null
}

function shouldSkipSrc(firstSeg: string | undefined): boolean {
  if (!firstSeg) return true
  return (
    SKIP_SRC_DIRS.includes(firstSeg) ||
    CONFIG_PREFIXES.some((c) => firstSeg.startsWith(c)) ||
    firstSeg.includes(".config.")
  )
}

function joinWithSrc(filePath: string, segments: string[]): string {
  if (!filePath) return ""
  return shouldSkipSrc(segments[0]) ? filePath : `src/${filePath}`
}

type ScopedParts = {
  org: string
  wsFolder: string
  pkg: string
  rest: string[]
  filePath: string
}

function parseScoped(rawPath: string): ScopedParts {
  let withoutAt = rawPath.slice(1)
  const firstSeg = withoutAt.split("/")[0]
  if (SCOPED_ALIASES[firstSeg]) {
    withoutAt =
      SCOPED_ALIASES[firstSeg] + withoutAt.slice(firstSeg.length)
  }

  const parts = withoutAt.split("/")
  const org = parts[0].toLowerCase()
  const isExplicitWs = WORKSPACE_FOLDERS.includes(parts[1])
  const wsFolder = isExplicitWs ? parts[1] : DEFAULT_WORKSPACE
  const pkg = (isExplicitWs ? parts[2] : parts[1])?.toLowerCase()
  const rest = isExplicitWs ? parts.slice(3) : parts.slice(2)

  return { org, wsFolder, pkg, rest, filePath: rest.join("/") }
}

// -- resolvers --------------------------------------------------------------

function resolveScoped(
  rawPath: string,
  baseProjectsDir: string,
): string {
  const base = expandDir(baseProjectsDir)
  const { org, wsFolder, pkg, rest, filePath } = parseScoped(rawPath)

  const isExplicitScope = pkg === "web" || pkg === "api"

  // Redirect based on ref segments (only when scope isn't explicit)
  if (!isExplicitScope && filePath) {
    const targetPkg = inferPkg(rest) ?? DEFAULT_PKG
    return path.join(
      base,
      org,
      wsFolder,
      targetPkg,
      joinWithSrc(filePath, rest),
    )
  }

  if (!filePath) return path.join(base, org, wsFolder, pkg)
  return path.join(
    base,
    org,
    wsFolder,
    pkg,
    joinWithSrc(filePath, rest),
  )
}

function resolveRelative(
  relativePath: string,
  baseDir: string,
): string {
  const parts = relativePath.split("/")
  if (parts[0] === "src") return path.join(baseDir, relativePath)
  return path.join(baseDir, "src", relativePath)
}

function resolveWithoutScope(
  rawPath: string,
  baseProjectsDir: string,
): string {
  const segments = rawPath.replace(/^src\//, "").split("/")
  const targetPkg = inferPkg(segments) ?? DEFAULT_PKG
  return resolveScoped(
    `@paladin/${targetPkg}/${rawPath}`,
    baseProjectsDir,
  )
}

// -- entry ------------------------------------------------------------------

export function resolvePath(
  rawPath: string,
  scope?: string | null,
  baseProjectsDirectory?: string | null,
): string {
  const projectsDir = baseProjectsDirectory ?? "~/projects"

  if (rawPath.startsWith("~/"))
    return path.join(os.homedir(), rawPath.slice(2))
  if (path.isAbsolute(rawPath)) return rawPath
  if (rawPath.startsWith("@"))
    return resolveScoped(rawPath, projectsDir)

  if (!scope) return resolveWithoutScope(rawPath, projectsDir)

  const resolvedBase = scope.startsWith("@")
    ? resolveScoped(scope, projectsDir)
    : expandDir(scope)

  return resolveRelative(rawPath, resolvedBase)
}
