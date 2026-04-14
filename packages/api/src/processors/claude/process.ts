// src/processors/claude/process.ts
// TODO: refactor extractProject to match the fields

import path from "node:path"
import os from "node:os"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"

import type { Conversation, FileEntry, Message, ParseResult, ProjectInfo } from "../../types/claude"

export type { Conversation, FileEntry, ParseResult }

// ── Header extraction ───────────────────────────────────────

const COMMENT_PATTERNS = [
  /^\/\/\s*(.+)/,
  /^#(?!!)(?:#*)\s+(.+)/,
  /^<!--\s*(.+?)\s*-->/,
]

const SKIP_ACTIONS = new Set(["delete", "deleted", "deprecate", "deprecated"])

function extractHeader(content: string): string | null {
  const lines = content.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#!")) continue

    let matchedComment = false

    for (const pattern of COMMENT_PATTERNS) {
      const m = trimmed.match(pattern)
      if (!m) continue

      matchedComment = true
      return parseHeaderComment(m[1])
    }

    if (matchedComment) continue
    return null
  }

  return null
}

function parseHeaderComment(raw: string): string | null {
  const match = raw.trim().match(/^(\S+)/)
  if (!match) return null

  const token = match[1]
  if (!token.includes("/") && !token.includes(".")) return null

  const rest = raw.trim().slice(token.length).trim()
  if (rest && SKIP_ACTIONS.has(rest.toLowerCase())) return null

  return token
}

// ── Content preparation ─────────────────────────────────────

function prepareContent(content: string, relativePath: string): string {
  if (relativePath.endsWith(".json")) {
    return stripHeader(content)
  }
  return content
}

function stripHeader(content: string): string {
  const lines = content.split("\n")
  let index = 0
  while (index < 3 && index < lines.length && lines[index].trim().startsWith("//")) {
    index++
  }
  return lines.slice(index).join("\n").trimStart()
}

// ── Context extraction ──────────────────────────────────────

const SCOPED_PKG_RE = /@([\w-]+)\/([\w-]+)/

function extractBaseDir(messages: Message[]): string | null {
  for (const msg of messages) {
    if (msg.sender !== "human" && msg.sender !== "user") continue

    const text = msg.content
      .map((b) => (b.type === "text" ? (b as any).text : ""))
      .join("\n")

    // explicit "current directory is ..."
    const dirMatch = text.match(/(?:current directory|cwd|working directory)\s+(?:is\s+)?(.+)/i)
    if (dirMatch) return dirMatch[1].trim()

    // scoped package reference like @org/name
    const scopeMatch = text.match(SCOPED_PKG_RE)
    if (scopeMatch) return `@${scopeMatch[1]}/${scopeMatch[2]}`

    return null
  }

  return null
}

function extractScopeFromTitle(title: string): string | null {
  const m = title.match(SCOPED_PKG_RE)
  if (!m) return null
  return `@${m[1]}/${m[2]}`.toLowerCase()
}

// ── Project info ────────────────────────────────────────────

export function extractProject(
  files: FileEntry[],
  baseProjectsDirectory: string,
): ProjectInfo | null {
  const home = os.homedir()
  const base = expandDir(baseProjectsDirectory)

  for (const file of files) {
    // find the first path segment under base that looks like a project root
    if (!file.path.startsWith(base)) continue

    const rel = file.path.slice(base.length + 1)
    const org = rel.split(path.sep)[0]
    if (!org) continue

    // org/packages/pkg/... → rootDir is org
    const rootDir = path.join(base, org)
    return { projectName: org, rootDir }
  }

  return null
}


function resolvePath(
  rawPath: string,
  baseDir: string,
  baseProjectsDirectory: string,
): string {
  const base = expandDir(baseProjectsDirectory)
  const withoutAt = rawPath.slice(1) // strip leading @
  const parts = withoutAt.split("/")

  const org = parts[0]
  const workspaceFolders = ["packages", "apps"]
  const defaultWorkspaceFolder = "packages"

  const isExplicitWs = workspaceFolders.includes(parts[1])
  const pkg = isExplicitWs ? parts[2] : parts[1]
  const rest = isExplicitWs ? parts.slice(3) : parts.slice(2)
  const wsFolder = isExplicitWs ? parts[1] : defaultWorkspaceFolder

  const filePath = rest.join("/")

  // skip /src/ injection for root-level dirs, config files, or if already present
  const skipSrcDirs = ["src", "docs", "scripts"]
  const configPrefixes = ["tsconfig", "package.json"]
  const firstName = rest[0] ?? ""

  const skipSrc =
    !filePath ||
    skipSrcDirs.includes(firstName) ||
    configPrefixes.some((c) => firstName.startsWith(c)) ||
    firstName.includes(".config.")

  const resolved = skipSrc ? filePath : `src/${filePath}`

  return path.join(base, org, wsFolder, pkg, resolved)
}


function expandDir(dir: string): string {
  if (dir.startsWith("~/")) {
    return path.join(homedir(), dir.slice(2))
  }
  return dir
}

function resolvePath(
  rawPath: string,
  baseDir: string | null,
  baseProjectsDirectory: string,
): string {
  const home = os.homedir()

  if (rawPath.startsWith("~/")) {
    return path.join(home, rawPath.slice(2))
  }
  

  if (path.isAbsolute(rawPath)) {
    return rawPath
  }

  // @scope/pkg/... → smart resolve
  if (rawPath.startsWith("@")) {
    return resolveScoped(rawPath, baseProjectsDirectory)
  }

  // relative — must have a baseDir
  if (!baseDir) {
    throw new Error(`cannot resolve relative path "${rawPath}" without a base directory`)
  }

  // baseDir is a scope reference — resolve it first, then append relative
  if (baseDir.startsWith("@")) {
    const resolvedBase = resolveScoped(baseDir, baseProjectsDirectory)
    return resolveRelative(rawPath, resolvedBase)
  }

  return resolveRelative(rawPath, expandDir(baseDir))
}

const SCOPED_ALIASES: Record<string, string> = {
  web: "paladin/web",
  api: "paladin/api",
}

function resolveScoped(
  rawPath: string,
  baseProjectsDirectory: string,
): string {
  const base = expandDir(baseProjectsDirectory)
  // expand short aliases: @web → @paladin/web, @api → @paladin/api
  const withoutAtRaw = rawPath.slice(1)
  const firstSeg = withoutAtRaw.split("/")[0]
  if (SCOPED_ALIASES[firstSeg]) {
    rawPath = "@" + SCOPED_ALIASES[firstSeg] + withoutAtRaw.slice(firstSeg.length)
  }
  const withoutAt = rawPath.slice(1)
  const parts = withoutAt.split("/")

  const workspaceFolders = ["packages", "apps"]
  const defaultWorkspaceFolder = "packages"

  const isExplicitWs = workspaceFolders.includes(parts[1])
 const org = parts[0].toLowerCase()

  const pkg = (isExplicitWs ? parts[2] : parts[1]).toLowerCase()
  const rest = isExplicitWs ? parts.slice(3) : parts.slice(2)
  const wsFolder = isExplicitWs ? parts[1] : defaultWorkspaceFolder

  const filePath = rest.join("/")

  // no file path — return the package root (let resolveRelative handle the rest)
  if (!filePath) {
    return path.join(base, org, wsFolder, pkg)
  }

  // skip /src/ for root-level dirs, config files, or if already present
  const skipSrcDirs = ["src", "docs", "scripts"]
  const configPrefixes = ["tsconfig", "package.json"]
  const firstName = rest[0]

  const skipSrc =
    skipSrcDirs.includes(firstName) ||
    configPrefixes.some((c) => firstName.startsWith(c)) ||
    firstName.includes(".config.")

  const resolved = skipSrc ? filePath : `src/${filePath}`

  return path.join(base, org, wsFolder, pkg, resolved)
}

/**
 * Resolve a relative path against a base directory,
 * probing for /src/ if the direct path doesn't exist.
 */
function resolveRelative(relativePath: string, baseDir: string): string {
  const direct = path.join(baseDir, relativePath)
  if (existsSync(path.dirname(direct))) return direct

  // try with /src/ injection
  const parts = relativePath.split("/")
  if (parts[0] !== "src") {
    const withSrc = path.join(baseDir, "src", relativePath)
    if (existsSync(path.dirname(withSrc))) return withSrc
  }

  return direct
}

function resolveRelative(relativePath: string, baseDir: string): string {
  const parts = relativePath.split("/")
  if (parts[0] !== "src") {
    return path.join(baseDir, "src", relativePath)
  }
  return path.join(baseDir, relativePath)
}


// ── Filter changed ──────────────────────────────────────────

export async function filterChanged(files: FileEntry[]): Promise<FileEntry[]> {
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

// ── Main processor ──────────────────────────────────────────

interface RawArtifact {
  content: string
  updatedAt: string | null
}

/**
 * @param baseProjectsDirectory - Root directory for scoped packages (e.g. ~/projects).
 *   Used to expand `@scope/...` paths → `${baseProjectsDirectory}/scope/packages/...`.
 *
 *   `baseDir` is different — it's extracted at runtime from the first user message
 *   (either "The current directory is ..." or a scoped package reference like @org/name)
 *   and used to resolve relative paths.
 */
export async function processConversation(
  conversation: Conversation,
  baseProjectsDirectory: string,
): Promise<ParseResult | null> {
  const artifacts = new Map<string, RawArtifact>()

  // 1. extract artifacts from assistant messages
  for (const msg of conversation.messages) {
    if (msg.sender !== "assistant") continue

    for (const block of msg.content) {
      if (
        block?.type !== "tool_use"
        || block?.name !== "artifacts"
        || !block?.input
      ) continue

      const { command, id, content, old_str, new_str } = block.input
      if (!id) continue

      const timestamp = block.stop_timestamp ?? null

      if (command === "create" || command === "rewrite") {
        if (content != null) {
          artifacts.set(id, { content, updatedAt: timestamp })
        }
      }

      if (command === "update") {
        const current = artifacts.get(id)
        if (!current || old_str == null || new_str == null) continue

        let updated = current.content.replace(old_str, new_str)

        if (updated === current.content) {
          updated = current.content.replace(old_str.trim(), new_str.trim())
        }

        if (updated !== current.content) {
          artifacts.set(id, { content: updated, updatedAt: timestamp })
        }
      }
    }
  }

  // 2. extract baseDir — first try messages, then fall back to title
  let baseDir = extractBaseDir(conversation.messages)
  if (!baseDir) {
    const fromTitle = extractScopeFromTitle(conversation.title)
    if (fromTitle) baseDir = fromTitle
  }

  // 3. resolve paths, deduplicate by resolved path (keep latest)
  const byPath = new Map<string, { content: string, updatedAt: string | null }>()

  for (const artifact of artifacts.values()) {
    const rawPath = extractHeader(artifact.content)
    if (!rawPath) continue

    const resolved = resolvePath(rawPath, baseDir, baseProjectsDirectory)

    const existing = byPath.get(resolved)
    if (existing && existing.updatedAt && artifact.updatedAt) {
      if (artifact.updatedAt <= existing.updatedAt) continue
    }

    byPath.set(resolved, {
      content: artifact.content,
      updatedAt: artifact.updatedAt,
    })
  }

  // 4. prepare content
  const allFiles: FileEntry[] = []

  for (const [resolvedPath, entry] of byPath) {
    allFiles.push({
      path: resolvedPath,
      content: prepareContent(entry.content, resolvedPath),
    })
  }

  if (!allFiles.length) return null

  // 5. extract project info
  const project = extractProject(allFiles, baseProjectsDirectory)
  if (!project) return null

  // 6. filter to only changed files
  const files = await filterChanged(allFiles)
  if (!files.length) return null

  // 7. check if project is new
  const isNew = !existsSync(project.rootDir)

  return {
    files,
    project: { name: project.projectName, dir: project.rootDir, new: isNew },
  }
}
