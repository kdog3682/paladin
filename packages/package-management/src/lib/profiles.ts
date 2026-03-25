// @paladin/package-management/lib/profiles.ts

import type { SnapshotFile } from "./snapshot"

export type ProfileKey =
  | "vite"
  | "nextjs"
  | "astro"
  | "chrome-ext"
  | "typescript"

interface ProfileRule {
  key: ProfileKey
  match: (files: SnapshotFile[]) => boolean
}

const rules: ProfileRule[] = [
  {
    key: "vite",
    match: (files) => files.some(f => /vite\.config\.\w+$/.test(f.path)),
  },
  {
    key: "nextjs",
    match: (files) => files.some(f => /next\.config\.\w+$/.test(f.path)),
  },
  {
    key: "astro",
    match: (files) => files.some(f => /astro\.config\.\w+$/.test(f.path)),
  },
  {
    key: "chrome-ext",
    match: (files) => {
      const manifest = files.find(f => f.path.endsWith("manifest.json"))
      if (!manifest) return false
      const parsed = JSON.parse(manifest.content)
      return "manifest_version" in parsed
    },
  },
]

export function inferProfile(files: SnapshotFile[]): ProfileKey {
  for (const rule of rules) {
    if (rule.match(files)) return rule.key
  }
  return "typescript"
}

/**
 * Infer profile from file paths alone (no content needed).
 * Used when we only have filenames, not full snapshot data.
 */
export function inferProfileFromPaths(paths: string[]): ProfileKey {
  if (paths.some(p => /vite\.config\.\w+$/.test(p))) return "vite"
  if (paths.some(p => /next\.config\.\w+$/.test(p))) return "nextjs"
  if (paths.some(p => /astro\.config\.\w+$/.test(p))) return "astro"
  if (paths.some(p => p.endsWith("manifest.json"))) return "chrome-ext"
  return "typescript"
}
