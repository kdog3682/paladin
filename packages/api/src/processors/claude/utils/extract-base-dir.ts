// src/processors/claude/utils/extract-base-dir.ts

import type { Message } from "../../../types/claude"

const SCOPED_PKG_RE = /@([\w-]+)\/([\w-]+)/

export function extractBaseDir(messages: Message[]): string | null {
  for (const msg of messages) {
    if (msg.sender !== "human" && msg.sender !== "user") continue

    const text = msg.content
      .map((b) => (b.type === "text" ? (b as any).text : ""))
      .join("\n")

    const dirMatch = text.match(/(?:current directory|cwd|working directory)\s+(?:is\s+)?(.+)/i)
    if (dirMatch) return dirMatch[1].trim()

    const scopeMatch = text.match(SCOPED_PKG_RE)
    if (scopeMatch) return `@${scopeMatch[1]}/${scopeMatch[2]}`

    return null
  }

  return null
}

export function extractScopeFromTitle(title: string): string | null {
  const m = title.match(SCOPED_PKG_RE)
  if (!m) return null
  return `@${m[1]}/${m[2]}`.toLowerCase()
}
