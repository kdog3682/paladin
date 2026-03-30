// @paladin/conversation-processor/utils/extract-header.ts

import type { HeaderResult } from "./extract-header.types"

const COMMENT_PATTERNS = [
  /^\/\/\s*(.+)/,         // // @acme/pkg/file.ts
  /^#(?!!)(?:#*)\s+(.+)/, // # @acme/pkg/file.yaml (not shebang)
  /^<!--\s*(.+?)\s*-->/,  // <!-- @acme/pkg/file.html -->
]

const SKIP_ACTIONS = new Set(["delete", "deleted", "deprecate", "deprecated"])

const SEPARATOR_RE = /\s+(?:--|—|––)\s+/
const ACTION_RE = /^(append|delete|deleted|deprecate|deprecated)$/i

export function extractHeader(content: string): HeaderResult {
  const lines = content.split("\n", 3)

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("#!")) continue

    for (const pattern of COMMENT_PATTERNS) {
      const m = trimmed.match(pattern)
      if (!m) continue

      let raw = m[1].trim()
      if (!raw.includes("/") && !raw.includes(".")) return null

      let action: HeaderResult["action"] = "write"

      // check for separator style: @acme/pkg/file.ts -- append
      const sepMatch = raw.match(SEPARATOR_RE)
      if (sepMatch) {
        const tag = raw.slice(sepMatch.index! + sepMatch[0].length).trim()
        if (ACTION_RE.test(tag)) {
          if (SKIP_ACTIONS.has(tag.toLowerCase())) return null
          action = tag.toLowerCase() as HeaderResult["action"]
        }
        raw = raw.slice(0, sepMatch.index).trim()
      }

      // check for inline tag: @acme/pkg/file.ts (append)
      const parenMatch = raw.match(/\s*\((\w+)\)\s*$/)
      if (parenMatch) {
        const tag = parenMatch[1]
        if (ACTION_RE.test(tag)) {
          if (SKIP_ACTIONS.has(tag.toLowerCase())) return null
          action = tag.toLowerCase() as HeaderResult["action"]
        }
        raw = raw.slice(0, parenMatch.index).trim()
      }

      // check for trailing tag: @acme/pkg/file.ts append
      const parts = raw.split(/\s+/)
      const last = parts[parts.length - 1]
      if (parts.length > 1 && ACTION_RE.test(last)) {
        if (SKIP_ACTIONS.has(last.toLowerCase())) return null
        action = last.toLowerCase() as HeaderResult["action"]
        raw = parts.slice(0, -1).join(" ").trim()
      }

      // strip any trailing whitespace or noise
      raw = raw.trim()

      if (!raw.includes("/") && !raw.includes(".")) return null

      return { rawPath: raw, action }
    }

    return null
  }

  return null
}
