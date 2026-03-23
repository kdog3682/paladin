// @paladin/utils/fs.ts

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"

export function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p
}

export function writeFileSafe(
  filePath: string,
  content: string | Record<string, unknown>,
  options?: { json?: boolean }
): void {
  const expanded = expandHome(filePath)
  const dir = dirname(expanded)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const data = typeof content === "string"
    ? content
    : JSON.stringify(content, null, 2) + "\n"
  writeFileSync(expanded, data, "utf-8")
}

export function readFileSafe<T = string>(
  filePath: string,
  options?: { json?: boolean }
): T | null {
  const expanded = expandHome(filePath)
  if (!existsSync(expanded)) return null
  const content = readFileSync(expanded, "utf-8")
  if (options?.json) {
    return JSON.parse(content) as T
  }
  return content as T
}
