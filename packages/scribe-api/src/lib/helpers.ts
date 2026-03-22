// @paladin/scribe-api/src/lib/helpers.ts

import { deepseek } from "./deepseek"

export async function determineTicketName(body: string): Promise<string> {
  if (!body.trim()) return "Untitled"

  const snippet = body.slice(0, 2000)
  const result = await deepseek(
    snippet,
    "You are a concise naming assistant. Given the following ticket body, produce a short descriptive title (3-8 words). Return ONLY the title, nothing else."
  )

  return result || "Untitled"
}

export async function determineTicketKeywords(body: string): Promise<string[]> {
  if (!body.trim()) return []

  const snippet = body.slice(0, 2000)
  const result = await deepseek(
    snippet,
    "You are a keyword extraction assistant. Given the following ticket body, extract 3-8 relevant keyword tags. Return ONLY a JSON array of lowercase strings, e.g. [\"auth\",\"refactor\",\"api\"]. No markdown, no explanation."
  )

  const parsed = JSON.parse(result)
  if (Array.isArray(parsed)) return parsed.map(String)
  return []
}
