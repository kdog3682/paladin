
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"

export function getXdgCacheHome(): string {
  return process.env.XDG_CACHE_HOME || join(homedir(), ".cache")
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2))
  return p
}

/**
 * Writes content to a file, creating parent directories if they don't exist.
 * Supports both string and object (JSON) content.
 *
 * @param filePath - File path (supports ~/ for home directory)
 * @param content - Content to write (string or object for JSON)
 * @param options.json - If true, writes object as formatted JSON
 */
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
  const data = typeof content === "string" ? content : JSON.stringify(content, null, 2) + "\n"
  writeFileSync(expanded, data, "utf-8")
}

/**
 * Reads a file safely, returning null if it doesn't exist.
 * Attempts to parse as JSON if content looks like JSON, or if options.json is true.
 *
 * @param filePath - File path (supports ~/ for home directory)
 * @param options.json - If true, forces JSON parsing
 * @returns File content as string/parsed JSON, or null if file doesn't exist
 */
export function readFileSafe<T = string>(
  filePath: string,
  options?: { json?: boolean }
): T | null {
  const expanded = expandHome(filePath)
  if (!existsSync(expanded)) return null
  try {
    const content = readFileSync(expanded, "utf-8")
    if (options?.json) {
      return JSON.parse(content) as T
    }
    try {
      return JSON.parse(content) as T
    } catch {
      return content as T
    }
  } catch {
    return null
  }
}

/**
 * Recursively merges source object into target object (mutates target).
 * Arrays are replaced entirely, not merged.
 *
 * @param target - Object to merge into (mutated)
 * @param source - Object to merge from
 */
export function deepMergeInto(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      deepMergeInto(
        target[key] as Record<string, unknown>,
        value as Record<string, unknown>
      )
    } else {
      target[key] = value
    }
  }
}

/**
 * Recursively merges two objects, returning a new object (immutable).
 * Arrays are replaced entirely, not merged. Only adds/updates keys from overlay;
 * existing keys in base that aren't in overlay are preserved.
 *
 * @param base - Base object
 * @param overlay - Overlay object to merge (takes precedence)
 * @returns New merged object
 */
export function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base }

  for (const [key, value] of Object.entries(overlay)) {
    if (!(key in result)) {
      result[key] = value
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      )
    }
  }

  return result
}
