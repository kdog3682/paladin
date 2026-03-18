// @paladin/project-viewer-backend/src/lib/walk.ts
import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, extname, basename } from "node:path"

export type FileNode = {
  path: string
  name: string
  type: "file" | "dir"
  children?: FileNode[]
  size?: number
}

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".cache",
  "coverage",
  "__pycache__",
  ".venv",
  "vendor",
])

const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp3", ".mp4", ".wav", ".avi", ".mov",
  ".lock", ".map",
])

const IGNORED_NAMES = new Set([
  "LICENSE", "LICENSE.md", "LICENSE.txt",
  ".prettierrc", ".prettierrc.json", ".prettierrc.js", ".prettierrc.yaml",
  ".prettierignore",
  ".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.yaml",
  ".eslintignore",
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".dockerignore",
  "Dockerfile",
  ".DS_Store",
  "thumbs.db",
  "yarn.lock",
  "pnpm-lock.yaml",
  "package-lock.json",
  "bun.lockb",
  "bun.lock",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  ".npmrc",
  ".nvmrc",
  ".node-version",
  ".browserslistrc",
  "renovate.json",
  ".releaserc",
])

const MANIFEST_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "tsconfig.build.json",
  "tsconfig.node.json",
  "vite.config.ts", "vite.config.js",
  "next.config.ts", "next.config.js", "next.config.mjs",
  "webpack.config.js", "webpack.config.ts",
  "rollup.config.js", "rollup.config.ts",
  "babel.config.js", "babel.config.json",
  "jest.config.js", "jest.config.ts",
  "vitest.config.ts", "vitest.config.js",
  "tailwind.config.ts", "tailwind.config.js",
  "postcss.config.js", "postcss.config.mjs",
  "turbo.json",
  "Makefile",
  "Cargo.toml",
  "go.mod", "go.sum",
  "pyproject.toml", "setup.py", "setup.cfg",
  "Gemfile",
  "biome.json",
])

export type FileCategory = "ignored" | "manifest" | "test" | "config" | "source"

export function categorize(name: string, path: string): FileCategory {
  if (IGNORED_NAMES.has(name)) return "ignored"
  if (IGNORED_EXTENSIONS.has(extname(name).toLowerCase())) return "ignored"
  if (MANIFEST_NAMES.has(name)) return "manifest"
  if (
    path.includes("__tests__") ||
    path.includes("__test__") ||
    name.includes(".test.") ||
    name.includes(".spec.") ||
    name.endsWith("_test.go") ||
    name.endsWith("_test.py")
  ) return "test"
  if (name.startsWith(".") || name.endsWith(".config.ts") || name.endsWith(".config.js")) return "config"
  return "source"
}

export async function walk(
  root: string,
  sub = "",
): Promise<{ tree: FileNode[], flat: FlatFile[] }> {
  const dir = sub ? join(root, sub) : root
  const entries = await readdir(dir, { withFileTypes: true })
  const tree: FileNode[] = []
  const flat: FlatFile[] = []

  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of sorted) {
    const rel = sub ? `${sub}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const result = await walk(root, rel)
      if (result.tree.length > 0) {
        tree.push({
          path: rel,
          name: entry.name,
          type: "dir",
          children: result.tree,
        })
        flat.push(...result.flat)
      }
      continue
    }

    const category = categorize(entry.name, rel)
    const info = await stat(join(root, rel))

    tree.push({
      path: rel,
      name: entry.name,
      type: "file",
      size: info.size,
    })

    flat.push({
      path: rel,
      name: entry.name,
      category,
      size: info.size,
    })
  }

  return { tree, flat }
}

export type FlatFile = {
  path: string
  name: string
  category: FileCategory
  size: number
}

export async function readContent(root: string, path: string): Promise<string> {
  const full = join(root, path)
  const buf = await readFile(full)
  return buf.toString("utf-8")
}

export function countFlat(flat: FlatFile[], excluded: Set<string>): number {
  return flat.filter(f => !excluded.has(f.category) && !excluded.has(f.path)).length
}
