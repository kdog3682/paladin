// src/processors/claude/process.ts

import { extractHeader } from "./utils/extract-header"
import { resolvePath } from "./utils/resolve-path"
import { extractBaseDir, extractScopeFromTitle } from "./utils/extract-base-dir"
import type { Conversation, FileEntry, ParseResult } from "../../types/claude"

interface RawArtifact {
  content: string
  updatedAt: string | null
}

/**
 * @param baseProjectsDirectory - Root directory for scoped packages (e.g. ~/projects).
 *   Used to expand `@scope/...` paths → `${baseProjectsDirectory}/scope/packages/...`.
 *
 *   `baseDir` is different — extracted at runtime from the first user message
 *   (either "The current directory is ..." or a scoped package reference like @org/name)
 *   and used to resolve relative paths.
 */
export function processConversation(
  conversation: Conversation,
  baseProjectsDirectory: string,
): ParseResult | null {
  const artifacts = extractArtifacts(conversation)

  // baseDir — first try messages, then fall back to title
  const baseDir = null
    extractBaseDir(conversation.messages) ??
    extractScopeFromTitle(conversation.title)

  // resolve paths, dedupe by resolved path (keep latest)
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

  const files: FileEntry[] = Array.from(byPath, ([path, entry]) => ({
    path,
    content: entry.content,
  }))

  if (!files.length) return null

  return { files }
}

function extractArtifacts(conversation: Conversation): Map<string, RawArtifact> {
  const artifacts = new Map<string, RawArtifact>()

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
        continue
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

  return artifacts
}
