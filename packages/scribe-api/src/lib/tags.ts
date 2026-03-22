// @paladin/scribe-api/src/lib/tags.ts

import { determineTicketKeywords } from "./helpers"

/**
 * Derive package-scoped tags from source file paths.
 * e.g. ~/projects/paladin/packages/foobar/src/thing.ts -> @paladin/foobar
 */
function tagsFromSourceFiles(files: string[]): string[] {
  const tags = new Set<string>()

  for (const file of files) {
    const match = file.match(/\/packages\/([^/]+)\//)
    if (match) {
      const parent = file.match(/\/([^/]+)\/packages\//)
      const scope = parent ? `@${parent[1]}` : "@unknown"
      tags.add(`${scope}/${match[1]}`)
    }
  }

  return [...tags]
}

export async function generateTags(body: string, sourceFiles: string[]): Promise<string[]> {
  const fileTags = tagsFromSourceFiles(sourceFiles)
  const keywordTags = body.trim() ? await determineTicketKeywords(body) : []
  return [...new Set([...fileTags, ...keywordTags])]
}
