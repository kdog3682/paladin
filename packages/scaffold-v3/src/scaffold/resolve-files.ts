// @paladin/scaffold-v3/scaffold/resolve-files.ts

import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { extname } from "path"
import { resolvePath } from "./resolve-path"
import { getImports } from "./get-imports"
import type { FileContent, ResolvedFile } from "./types"

// --- header helpers ---

export function extractHeader(content: string): string | null {
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

export function stripHeader(content: string): string {
  return content.replace(/^\/\/\s*.+\n/, "")
}

export function deriveProjectName(files: FileContent[]): string | null {
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
  const pattern = /\/\/\s*@?deprecated\w*/i
  return pattern.test(lines[0] ?? "") || pattern.test(lines[1] ?? "")
}

// --- resolve & diff ---

interface ResolveConfig {
  projectDir: string
  projectName: string
  workspaceFolders: string[]
  defaultWorkspaceFolder: string
}

/**
 * resolve artifact file contents to absolute paths, dedupe by
 * latest updatedAt, diff against disk, and compute imports.
 */
export async function resolveAndDiff(
  fileContents: FileContent[],
  config: ResolveConfig,
): Promise<ResolvedFile[]> {
  const { projectDir, projectName, workspaceFolders, defaultWorkspaceFolder } = config

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
    const resolved = resolvePath(header, projectDir, projectName, workspaceFolders, defaultWorkspaceFolder)
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
      imports: getImports(candidate.content, projectName),
    })
  }

  return changed
}
