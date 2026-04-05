// @paladin/tooling/package-transfer/utils.ts
import { readdir, stat } from "fs/promises"
import { join, extname } from "path"

export const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".mjs", ".cjs",
])

export async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue
      files.push(...await walkFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }

  return files
}

export function isRewritableFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(filePath))
}

export function log(msg: string) {
  console.log(`[package-transfer] ${msg}`)
}

export function logError(msg: string) {
  console.error(`[package-transfer] ERROR: ${msg}`)
}

export async function dirExists(path: string): Promise<boolean> {
  const s = await stat(path).catch(() => null)
  return s?.isDirectory() ?? false
}

export async function fileExists(path: string): Promise<boolean> {
  const s = await stat(path).catch(() => null)
  return s?.isFile() ?? false
}

export function scopedNameToDir(name: string, scope: string): string {
  const pkg = name.replace(`${scope}/`, "")
  return join("packages", pkg)
}
