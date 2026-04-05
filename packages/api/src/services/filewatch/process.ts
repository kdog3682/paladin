// @paladin/packages/api/src/services/filewatch/process.ts

import path from "node:path"
import os from "node:os"

interface Message {
  sender: string
  content: Block[]
}

interface Block {
  type?: string
  name?: string
  input?: {
    command?: string
    id?: string
    content?: string
    old_str?: string
    new_str?: string
  }
  stop_timestamp?: string
}

export interface Conversation {
  url: string
  title: string
  updatedAt: string
  messages: Message[]
}

export interface FileEntry {
  path: string
  content: string
}

// --- header extraction ---

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

  // check for trailing action
  const rest = raw.trim().slice(token.length).trim()
  if (rest && SKIP_ACTIONS.has(rest.toLowerCase())) return null

  return token
}

// --- content preparation ---

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

// --- path resolution ---

function extractBaseDir(messages: Message[]): string | null {
  for (const msg of messages) {
    if (msg.sender === "human" || msg.sender === "user") {
      const text = msg.content
        .map((b) => (b.type === "text" ? (b as any).text : ""))
        .join("\n")
      const match = text.match(/The current directory is\s+(.+)/)
      if (match) return match[1].trim()
    }
  }
  return null
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

  // @scope/packages/... → baseProjectsDirectory/scope/packages/...
  if (rawPath.startsWith("@")) {
    const withoutAt = rawPath.slice(1)
    return path.join(expandDir(baseProjectsDirectory, home), withoutAt)
  }

  // relative — resolve against baseDir
  if (baseDir) {
    const expandedBase = baseDir.startsWith("@")
      ? path.join(expandDir(baseProjectsDirectory, home), baseDir.slice(1))
      : expandDir(baseDir, home)
    return path.join(expandedBase, rawPath)
  }

  return rawPath
}

function expandDir(dir: string, home: string): string {
  if (dir.startsWith("~/")) {
    return path.join(home, dir.slice(2))
  }
  return dir
}

// --- main processor ---

interface RawArtifact {
  content: string
  updatedAt: string | null
}

/**
 * @param baseProjectsDirectory - Root directory for scoped packages (e.g. ~/projects).
 *   Used to expand `@scope/...` paths → `${baseProjectsDirectory}/scope/...`.
 *
 *   `baseDir` is different — it's extracted at runtime from the first user message
 *   ("The current directory is ...") and used to resolve relative paths like `foo.ts`.
 */
export function processConversation(
  conversation: Conversation,
  baseProjectsDirectory: string,
): FileEntry[] {
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

  // 2. extract baseDir from first message
  const baseDir = extractBaseDir(conversation.messages)

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

  // 4. prepare content and return
  const results: FileEntry[] = []

  for (const [resolvedPath, entry] of byPath) {
    results.push({
      path: resolvedPath,
      content: prepareContent(entry.content, resolvedPath),
    })
  }

  return results
}
