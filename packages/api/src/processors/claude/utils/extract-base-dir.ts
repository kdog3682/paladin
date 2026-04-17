// src/processors/claude/utils/extract-base-dir.ts

import type { Message } from "../../../types/claude"

const SCOPED_PKG_RE = /@([\w-]+)\/([\w-]+)/

export function extractBaseDir(messages: Message[]): string | null {
   const msg = messages[0]
    if (msg.sender !== "human" && msg.sender !== "user")return 

    const text = msg.content
      .map((b) => (b.type === "text" ? (b as any).text : ""))
      .join("\n")

    const scopeMatch = text.match(SCOPED_PKG_RE)
    if (scopeMatch) return `@${scopeMatch[1]}/${scopeMatch[2]}`.toLowerCase()



}

export function extractScopeFromTitle(title: string): string | null {
  const m = title.match(SCOPED_PKG_RE)
  if (!m) return null
  return `@${m[1]}/${m[2]}`.toLowerCase()
}
