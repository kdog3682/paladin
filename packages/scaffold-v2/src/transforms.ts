// @paladin/scaffold-v2/transforms.ts

import type { ContentTransform, ResolvedFile } from "./types"

/**
 * apply content transforms to resolved files.
 * each transform has a `matches` pattern tested against absolutePath,
 * and an array of search/replace pairs applied in order.
 *
 * returns the number of files that were modified.
 */
export function applyTransforms(
  files: ResolvedFile[],
  transforms: ContentTransform[]
): number {
  let count = 0

  for (const file of files) {
    for (const transform of transforms) {
      if (!transform.matches.test(file.absolutePath)) continue

      let modified = false
      for (const { search, replace } of transform.replacements) {
        const next = file.content.replace(search, replace)
        if (next !== file.content) {
          file.content = next
          modified = true
        }
      }
      if (modified) count++
    }
  }

  return count
}

// --- built-in transforms ---

/**
 * rewrite `export default function Foo` → `export function Foo`
 * in .tsx files so components can be composed in a router/layout.
 */
export const namedExportTransform: ContentTransform = {
  matches: /\.tsx$/,
  replacements: [
    {
      search: /export\s+default\s+function\s+(\w+)/,
      replace: "export function $1",
    },
  ],
}

export const defaultTransforms: ContentTransform[] = [
  namedExportTransform,
]
