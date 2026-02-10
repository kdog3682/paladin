// @paladin/api/src/utils/parse-path.ts

/**
 * Extracts path from first comment line of file content.
 * Handles: // @paladin/ui/button.tsx
 *          // @paladin/ui/button.tsx (modified)
 *          # /absolute/path.py
 *          -- @org/pkg/file.sql
 */
export function parsePathFromComment(content: string): string | null {
  const lines = content.split("\n")

  for (let i = 0; i < Math.min(2, lines.length); i++) {
    const line = lines[i]
    const match = line.match(/^\s*(?:\/\/|#|--|\/\*)\s*([@\/][\w\-\/\.]+)/)
    if (match) return match[1]
  }

  return null
}
