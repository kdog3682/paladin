import { existsSync, statSync } from "node:fs"

export function isFile(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
