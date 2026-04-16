// src/processors/claude/utils/generate-commit.ts

import { deepseek } from "@paladin/ai"

const PROMPT = `Generate a single conventional commit message (e.g. "feat: ...", "fix: ...", "refactor: ...") summarizing the following user instructions from a coding session. Respond with ONLY the commit message, no quotes, no explanation.

User instructions:
`

export async function generateCommitMessage(userText: string): Promise<string> {
  const trimmed = userText.trim()
  if (!trimmed) return ""

  const response = await deepseek(PROMPT + trimmed)
  return response.trim().replace(/^["']|["']$/g, "")
}
