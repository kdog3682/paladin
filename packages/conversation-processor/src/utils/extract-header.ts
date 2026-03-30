// @paladin/conversation-processor/utils/extract-header.ts

import type { HeaderResult } from "./extract-header.types"

const COMMENT_PATTERNS = [
  /^\/\/\s*(.+)/,         // // @acme/pkg/file.ts
  /^#(?!!)(?:#*)\s+(.+)/, // # @acme/pkg/file.yaml (not shebang)
  /^<!--\s*(.+?)\s*-->/,  // <!-- @acme/pkg/file.html -->
]

const SKIP_ACTIONS = new Set(["deprecate", "deprecated"])

const SEPARATOR_RE = /\s+(?:--|—|––)\s+/
const ACTION_RE = /^(append|delete|deleted|deprecate|deprecated)$/i

type ParseCommentResult = {
  found: boolean
  header: HeaderResult
}

function parseComment(rawContent: string): ParseCommentResult {
  let raw = rawContent.trim()
  if (!raw.includes("/") && !raw.includes(".")) {
    return { found: false, header: null }
  }

  let action: NonNullable<HeaderResult>["action"] = "write"

  // check for separator style: @acme/pkg/file.ts -- append
  const sepMatch = raw.match(SEPARATOR_RE)
  if (sepMatch) {
    const tag = raw.slice(sepMatch.index! + sepMatch[0].length).trim()
    if (ACTION_RE.test(tag)) {
      if (SKIP_ACTIONS.has(tag.toLowerCase())) return { found: true, header: null }
      action = tag.toLowerCase() as NonNullable<HeaderResult>["action"]
    }
    raw = raw.slice(0, sepMatch.index).trim()
  }

  // check for inline tag: @acme/pkg/file.ts (append)
  const parenMatch = raw.match(/\s*\((\w+)\)\s*$/)
  if (parenMatch) {
    const tag = parenMatch[1]
    if (ACTION_RE.test(tag)) {
      if (SKIP_ACTIONS.has(tag.toLowerCase())) return { found: true, header: null }
      action = tag.toLowerCase() as NonNullable<HeaderResult>["action"]
    }
    raw = raw.slice(0, parenMatch.index).trim()
  }

  // check for trailing tag: @acme/pkg/file.ts append
  const parts = raw.split(/\s+/)
  const last = parts[parts.length - 1]
  if (parts.length > 1 && ACTION_RE.test(last)) {
    if (SKIP_ACTIONS.has(last.toLowerCase())) return { found: true, header: null }
    action = last.toLowerCase() as NonNullable<HeaderResult>["action"]
    raw = parts.slice(0, -1).join(" ").trim()
  }

  raw = raw.trim()
  if (!raw.includes("/") && !raw.includes(".")) {
    return { found: false, header: null }
  }

  return { found: true, header: { rawPath: raw, action } }
}

export function extractHeader(content: string): HeaderResult {
  const lines = content.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#!")) continue

    let matchedComment = false

    for (const pattern of COMMENT_PATTERNS) {
      const m = trimmed.match(pattern)
      if (!m) continue

      matchedComment = true
      const parsed = parseComment(m[1])
      if (parsed.found) return parsed.header
      break
    }

    if (matchedComment) continue
    return null
  }

  return null
}
